import * as vscode from "vscode";
import {
  type Collection,
  type RequestFile,
  type Response,
  type ErrorResponse,
  createHistoryStore,
  addToHistory,
  isErrorResponse,
  interpolate,
} from "@sentry-api/core";
import { VsCodeFileSystem } from "./vscode-fs";

/**
 * Message types that flow between the webview and the extension.
 */
export interface WebviewMessage {
  type: string;
  [key: string]: any;
}

/**
 * Response data sent back to the webview after a request completes.
 */
export interface SendResponseMessage {
  type: "response";
  response: Response | ErrorResponse;
}

/**
 * Handles a webview message and returns the result (if any).
 * This is a pure function that can be tested independently of VS Code.
 */
export async function handleWebviewMessage(
  message: WebviewMessage,
  state: WebviewState
): Promise<WebviewAction[]> {
  const actions: WebviewAction[] = [];

  switch (message.type) {
    case "folder-selected": {
      state.folderPath = message.path;
      if (state.fs) {
        state.collections = await state.fs.listCollections();
      }
      actions.push({
        type: "update",
        collections: state.collections,
        request: state.currentRequest,
        response: state.response,
        envFiles: [],
      });
      break;
    }

    case "request-selected": {
      if (state.fs && state.folderPath) {
        const request = await state.fs.readRequest(message.id);
        if (request) {
          state.currentRequest = request;
          state.response = undefined;
          actions.push({
            type: "update",
            collections: state.collections,
            request,
            response: undefined,
            envFiles: [],
          });
        }
      }
      break;
    }

    case "request-updated": {
      if (state.fs && state.currentRequest) {
        state.currentRequest = {
          ...state.currentRequest,
          ...message.data,
          updated: new Date().toISOString(),
        };
        if (state.currentRequest) {
          await state.fs.updateRequest(state.currentRequest);
        }
        actions.push({
          type: "update",
          collections: state.collections,
          request: state.currentRequest,
          response: state.response,
          envFiles: [],
        });
      }
      break;
    }

    case "env-file-selected": {
      state.activeEnvFile = message.name;
      break;
    }

    case "new-request": {
      if (state.fs && state.folderPath) {
        const request: RequestFile = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: message.name || "New Request",
          method: "GET",
          url: "",
          updated: new Date().toISOString(),
        };
        await state.fs.createRequest(request);
        state.currentRequest = request;
        state.collections = await state.fs.listCollections();
        actions.push({
          type: "update",
          collections: state.collections,
          request,
          response: state.response,
          envFiles: [],
        });
      }
      break;
    }

    case "send-request": {
      if (!state.folderPath || !state.currentRequest) {
        actions.push({
          type: "error",
          message: "No request selected or folder not set.",
        });
        break;
      }

      try {
        let envVars: Record<string, string> = {};
        if (state.activeEnvFile && state.fs) {
          envVars = await state.fs.readEnvFile(state.activeEnvFile);
        }

        const options = {
          method: state.currentRequest.method,
          url: interpolate(state.currentRequest.url, envVars),
          headers: state.currentRequest.headers
            ? Object.fromEntries(
                Object.entries(state.currentRequest.headers).map(
                  ([k, v]) => [k, interpolate(v, envVars)]
                )
              )
            : undefined,
          query: state.currentRequest.query
            ? Object.fromEntries(
                Object.entries(state.currentRequest.query).map(
                  ([k, v]) => [k, interpolate(String(v), envVars)]
                )
              )
            : undefined,
          body: state.currentRequest.body,
        };

        const { sendRequest: coreSendRequest } = await import(
          "@sentry-api/core"
        );
        const result = await coreSendRequest(options);

        if (isErrorResponse(result)) {
          state.response = result;
          actions.push({
            type: "error",
            message: `Request failed: ${result.error}${
              result.details ? ` - ${JSON.stringify(result.details)}` : ""
            }`,
          });
        } else {
          const response = result as Response;
          state.response = response;
          addToHistory(state.historyStore, options, response);
          actions.push({ type: "response", response });
        }
      } catch (error) {
        const err = error as Error;
        actions.push({ type: "error", message: `Request failed: ${err.message}` });
      }
      break;
    }

    case "get-history": {
      actions.push({ type: "history", history: state.historyStore.entries });
      break;
    }

    case "get-env-files": {
      if (state.fs) {
        const files = await state.fs.listEnvFiles();
        actions.push({ type: "env-files", files });
      }
      break;
    }

    case "delete-request": {
      if (state.fs && state.currentRequest) {
        const deleted = await state.fs.deleteRequest(state.currentRequest.id);
        if (deleted) {
          state.currentRequest = undefined;
          state.response = undefined;
          state.collections = await state.fs.listCollections();
          actions.push({
            type: "update",
            collections: state.collections,
            request: undefined,
            response: undefined,
            envFiles: [],
          });
        }
      }
      break;
    }

    default:
      console.log("Unknown message type:", message.type);
  }

  return actions;
}

/**
 * State that persists across webview messages.
 */
export interface WebviewState {
  folderPath: string | undefined;
  activeEnvFile: string | undefined;
  currentRequest: RequestFile | undefined;
  response: Response | ErrorResponse | undefined;
  collections: Collection[];
  historyStore: ReturnType<typeof createHistoryStore>;
  fs: VsCodeFileSystem | undefined;
}

/**
 * Actions returned from message handling.
 */
export interface WebviewAction {
  type: string;
  [key: string]: any;
}

/**
 * Manages the main webview for the Sentry API extension.
 * Provides the UI for browsing collections, editing requests, and viewing responses.
 * Acts as the bridge between the webview and the core library.
 */
export class WebviewManager {
  public readonly panel: vscode.WebviewPanel;
  private _state: WebviewState;

  constructor(private readonly context: vscode.ExtensionContext) {
    this._state = {
      folderPath: undefined,
      activeEnvFile: undefined,
      currentRequest: undefined,
      response: undefined,
      collections: [],
      historyStore: createHistoryStore(1000),
      fs: undefined,
    };

    this.panel = vscode.window.createWebviewPanel(
      "sentryApi",
      "Sentry API",
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    this.panel.webview.onDidReceiveMessage(
      async (message: WebviewMessage) => {
        const actions = await handleWebviewMessage(message, this._state);
        for (const action of actions) {
          await this.handleAction(action);
        }
      },
      undefined,
      context.subscriptions
    );

    this.panel.onDidDispose(() => {
      this.panel.dispose();
    }, undefined, context.subscriptions);

    this.updateContent();
  }

  get folderPath(): string | undefined {
    return this._state.folderPath;
  }

  /**
   * Sets the API folder and initializes the VS Code file system adapter.
   * This is the key integration point for step 11: opening folders via
   * VS Code's workspace APIs and using vscode.workspace.fs for all file ops.
   */
  setFolder(path: string): void {
    this._state.folderPath = path;
    this._state.fs = new VsCodeFileSystem(vscode.Uri.file(path));
    this.refreshCollections();
  }

  get activeEnvFile(): string | undefined {
    return this._state.activeEnvFile;
  }

  setActiveEnvFile(envFile: string): void {
    this._state.activeEnvFile = envFile;
  }

  get currentRequest(): RequestFile | undefined {
    return this._state.currentRequest;
  }

  setCurrentRequest(request: RequestFile): void {
    this._state.currentRequest = request;
  }

  async getCurrentRequest(): Promise<RequestFile | undefined> {
    if (this._state.currentRequest) {
      return this._state.currentRequest;
    }
    // Try to load the first request from the folder
    if (this._state.fs) {
      const collections = await this._state.fs.listCollections();
      if (collections.length > 0) {
        const first = collections[0];
        if (first.requests.length > 0) {
          const req = await this._state.fs.readRequest(first.requests[0].id);
          if (req) {
            this._state.currentRequest = req;
            return this._state.currentRequest;
          }
        }
      }
    }
    return undefined;
  }

  async showResponse(response: Response | ErrorResponse): Promise<void> {
    this._state.response = response;
    this.updateContent();
  }

  async refreshCollections(): Promise<void> {
    if (!this._state.fs) return;

    try {
      const collections = await this._state.fs.listCollections();
      this._state.collections = collections;
      this.updateContent();
    } catch (error) {
      console.error("Failed to refresh collections:", error);
      vscode.window.showErrorMessage(
        `Failed to refresh collections: ${error}`
      );
    }
  }

  /**
   * Sends a message to the webview.
   */
  postMessage(message: WebviewMessage): void {
    if (this.panel) {
      this.panel.webview.postMessage(message);
    }
  }

  /**
   * Handles an action returned from message processing.
   */
  private async handleAction(action: WebviewAction): Promise<void> {
    switch (action.type) {
      case "update":
        this.updateContent();
        break;

      case "response":
        this.postMessage({ type: "response", response: action.response });
        this.updateContent();
        break;

      case "error":
        this.postMessage({ type: "error", message: action.message });
        this.updateContent();
        break;

      case "history":
        this.postMessage({ type: "history", history: action.history });
        break;

      case "env-files":
        this.postMessage({ type: "env-files", files: action.files });
        break;

      default:
        console.log("Unknown action type:", action.type);
    }
  }

  private updateContent(): void {
    if (!this.panel) return;

    const cspSource = this.panel.webview.cspSource;
    const collectionsData = JSON.stringify(this._state.collections);
    const currentRequestData = this._state.currentRequest
      ? JSON.stringify(this._state.currentRequest)
      : "null";
    const responseData = this._state.response
      ? JSON.stringify(this._state.response)
      : "null";

    const html = [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src ' +
        cspSource +
        ' \'unsafe-inline\'; script-src ' +
        cspSource +
        ';">',
      '<title>Sentry API</title>',
      '<style>',
      '* { margin: 0; padding: 0; box-sizing: border-box; }',
      'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #1e1e1e; color: #d4d4d4; }',
      '.container { display: flex; height: 100vh; }',
      '.sidebar { width: 250px; background: #252526; border-right: 1px solid #3c3c3c; overflow-y: auto; }',
      '.sidebar-header { padding: 12px 16px; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #888; letter-spacing: 0.5px; }',
      '.request-item { padding: 6px 16px; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 8px; }',
      '.request-item:hover { background: #2a2d2e; }',
      '.request-item.active { background: #37373d; }',
      '.method-badge { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 3px; min-width: 40px; text-align: center; }',
      '.method-GET { background: #61affe; color: #fff; }',
      '.method-POST { background: #49cc90; color: #fff; }',
      '.method-PUT { background: #fca130; color: #fff; }',
      '.method-DELETE { background: #f93e3e; color: #fff; }',
      '.method-PATCH { background: #50e3c2; color: #fff; }',
      '.main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }',
      '.toolbar { padding: 8px 16px; background: #2d2d2d; border-bottom: 1px solid #3c3c3c; display: flex; gap: 8px; align-items: center; }',
      '.toolbar button { background: #0e639c; color: #fff; border: none; padding: 6px 16px; border-radius: 3px; cursor: pointer; font-size: 13px; }',
      '.toolbar button:hover { background: #1177bb; }',
      '.toolbar button:disabled { background: #555; cursor: not-allowed; }',
      '.toolbar .env-select { background: #3c3c3c; color: #d4d4d4; border: 1px solid #555; padding: 4px 8px; border-radius: 3px; font-size: 12px; }',
      '.editor { flex: 1; display: flex; flex-direction: column; padding: 16px; overflow-y: auto; }',
      '.editor label { font-size: 12px; color: #888; margin-bottom: 4px; display: block; }',
      '.editor input, .editor select, .editor textarea { width: 100%; background: #3c3c3c; border: 1px solid #555; color: #d4d4d4; padding: 8px; border-radius: 3px; font-size: 13px; margin-bottom: 12px; }',
      '.editor textarea { min-height: 100px; font-family: monospace; }',
      '.response { flex: 1; background: #1e1e1e; border-top: 1px solid #3c3c3c; overflow-y: auto; padding: 16px; }',
      '.response pre { font-family: monospace; font-size: 13px; white-space: pre-wrap; word-break: break-all; }',
      '.status-ok { color: #4ec9b0; }',
      '.status-error { color: #f44747; }',
      '.empty { display: flex; align-items: center; justify-content: center; height: 100%; color: #888; font-size: 14px; }',
      '.loading { color: #0e639c; font-style: italic; }',
      '.error-msg { color: #f44747; padding: 8px; background: rgba(244, 71, 71, 0.1); border-radius: 3px; margin-bottom: 8px; }',
      '.delete-btn { background: #c72e2e; color: #fff; border: none; padding: 4px 12px; border-radius: 3px; cursor: pointer; font-size: 12px; }',
      '.delete-btn:hover { background: #e04040; }',
      '</style>',
      '</head>',
      '<body>',
      '<div class="container">',
      '<div class="sidebar">',
      '<div class="sidebar-header">Requests</div>',
      '<div id="requests-list"></div>',
      '</div>',
      '<div class="main">',
      '<div class="toolbar">',
      '<button id="send-btn" disabled>Send</button>',
      '<button id="new-btn">New Request</button>',
      '<button id="delete-btn" class="delete-btn" style="display:none;">Delete</button>',
      '<select id="env-select" class="env-select" style="display:none;"><option value="">No Env</option></select>',
      '</div>',
      '<div class="editor" id="editor"></div>',
      '<div class="response" id="response"></div>',
      '</div>',
      '</div>',
      '<script>',
      'const vscode = acquireVsCodeApi();',
      'const sendBtn = document.getElementById("send-btn");',
      'const newBtn = document.getElementById("new-btn");',
      'const deleteBtn = document.getElementById("delete-btn");',
      'const envSelect = document.getElementById("env-select");',
      '',
      '// Send button handler',
      'sendBtn?.addEventListener("click", () => {',
      '  sendBtn.disabled = true;',
      '  sendBtn.textContent = "Sending...";',
      '  vscode.postMessage({ type: "send-request" });',
      "});",
      '',
      '// New request button handler',
      'newBtn?.addEventListener("click", () => {',
      '  vscode.postMessage({ type: "new-request" });',
      "});",
      '',
      '// Delete request button handler',
      'deleteBtn?.addEventListener("click", () => {',
      '  if (confirm("Delete this request?")) {',
      '    vscode.postMessage({ type: "delete-request" });',
      "  }",
      "});",
      '',
      '// Environment selector handler',
      'envSelect?.addEventListener("change", (e) => {',
      '  if (e.target.value) {',
      '    vscode.postMessage({ type: "env-file-selected", name: e.target.value });',
      "  }",
      "});",
      '',
      '// Listen for messages from the extension',
      'window.addEventListener("message", event => {',
      '  const message = event.data;',
      '  if (message.type === "update") {',
      '    renderSidebar(message.collections);',
      '    renderEditor(message.request);',
      '    renderResponse(message.response);',
      '    if (message.envFiles) {',
      '      renderEnvSelect(message.envFiles);',
      "  }",
      "  } else if (message.type === \"response\") {",
      '    sendBtn.disabled = false;',
      '    sendBtn.textContent = "Send";',
      '    renderResponse(message.response);',
      "  } else if (message.type === \"error\") {",
      '    sendBtn.disabled = false;',
      '    sendBtn.textContent = "Send";',
      '    showError(message.message);',
      "  } else if (message.type === \"history\") {",
      '    console.log("History received:", message.history.length, "entries");',
      "  } else if (message.type === \"env-files\") {",
      '    renderEnvSelect(message.files);',
      "  }",
      "});",
      '',
      '// Render sidebar with request list',
      'function renderSidebar(requests) {',
      '  const list = document.getElementById("requests-list");',
      "  if (!requests || requests.length === 0) {",
      "    list.innerHTML = '<div style=\"padding:12px 16px;color:#888;font-size:12px;\">No requests yet</div>';",
      "    return;",
      "  }",
      "  list.innerHTML = requests.map(r => {",
      "    return '<div class=\"request-item\" data-id=\"' + r.id + '\">' +",
      "      '<span class=\"method-badge method-' + r.method + '\">' + r.method + '</span>' +",
      "      '<span>' + (r.name || r.url) + '</span>' +",
      "      '</div>';",
      "  }).join('');",
      "  list.querySelectorAll('.request-item').forEach(item => {",
      "    item.addEventListener('click', () => {",
      "      vscode.postMessage({ type: 'request-selected', id: item.dataset.id });",
      "    });",
      "  });",
      "}",
      '',
      '// Render editor with request form',
      'function renderEditor(request) {',
      '  const editor = document.getElementById("editor");',
      "  if (!request) {",
      "    editor.innerHTML = '<div class=\"empty\">Open a folder to get started</div>';",
      "    sendBtn.disabled = true;",
      "    deleteBtn.style.display = 'none';",
      "    return;",
      "  }",
      "  sendBtn.disabled = false;",
      "  deleteBtn.style.display = 'inline-block';",
      "  var methodOptions = ['GET','POST','PUT','PATCH','DELETE'].map(function(m) {",
      "    return '<option value=\"' + m + '\"' + (m === request.method ? ' selected' : '') + '>' + m + '</option>';",
      "  }).join('');",
      "  editor.innerHTML = '<label>Method</label>' +",
      "    '<select id=\"method\">' + methodOptions + '</select>' +",
      "    '<label>URL</label>' +",
      "    '<input id=\"url\" value=\"' + escapeHtml(request.url || '') + '\" placeholder=\"https://api.example.com/endpoint\">' +",
      "    '<label>Headers (JSON)</label>' +",
      "    '<textarea id=\"headers\">' + escapeHtml(JSON.stringify(request.headers || {}, null, 2)) + '</textarea>' +",
      "    '<label>Query (JSON)</label>' +",
      "    '<textarea id=\"query\">' + escapeHtml(JSON.stringify(request.query || {}, null, 2)) + '</textarea>' +",
      "    '<label>Body</label>' +",
      "    '<textarea id=\"body\" placeholder=\"Request body (JSON)\"></textarea>';",
      "  editor.querySelector('#method')?.addEventListener('change', (e) => {",
      "    vscode.postMessage({ type: 'request-updated', data: { method: e.target.value } });",
      "  });",
      "  editor.querySelector('#url')?.addEventListener('change', (e) => {",
      "    vscode.postMessage({ type: 'request-updated', data: { url: e.target.value } });",
      "  });",
      "  editor.querySelector('#headers')?.addEventListener('change', (e) => {",
      "    try {",
      "      vscode.postMessage({ type: 'request-updated', data: { headers: JSON.parse(e.target.value) } });",
      "    } catch(err) {",
      "      // Invalid JSON, don't send",
      "    }",
      "  });",
      "  editor.querySelector('#query')?.addEventListener('change', (e) => {",
      "    try {",
      "      vscode.postMessage({ type: 'request-updated', data: { query: JSON.parse(e.target.value) } });",
      "    } catch(err) {",
      "      // Invalid JSON, don't send",
      "    }",
      "  });",
      "  editor.querySelector('#body')?.addEventListener('change', (e) => {",
      "    try {",
      "      vscode.postMessage({ type: 'request-updated', data: { body: JSON.parse(e.target.value) } });",
      "    } catch(err) {",
      "      // Invalid JSON, send as string",
      "      vscode.postMessage({ type: 'request-updated', data: { body: e.target.value } });",
      "    }",
      "  });",
      "}",
      '',
      '// Render response',
      'function renderResponse(response) {',
      '  const el = document.getElementById("response");',
      "  if (!response) {",
      "    el.innerHTML = '<div class=\"empty\">Send a request to see the response</div>';",
      "    return;",
      "  }",
      "  if (response.error) {",
      "    el.innerHTML = '<div class=\"error-msg\">Error: ' + escapeHtml(response.error) + '</div>' +",
      "      (response.details ? '<pre>' + escapeHtml(JSON.stringify(response.details, null, 2)) + '</pre>' : '');",
      "    return;",
      "  }",
      "  var cls = response.status >= 200 && response.status < 300 ? 'status-ok' : 'status-error';",
      "  el.innerHTML = '<div style=\"margin-bottom:8px;\"><span class=\"' + cls + '\">' + response.status + ' ' + escapeHtml(response.statusText) + '</span> · ' + response.duration + 'ms</div>' +",
      "    '<pre>' + (typeof response.data === 'string' ? escapeHtml(response.data) : escapeHtml(JSON.stringify(response.data, null, 2))) + '</pre>';",
      "}",
      '',
      '// Show error message',
      'function showError(message) {',
      '  const el = document.getElementById("response");',
      "  el.innerHTML = '<div class=\"error-msg\">' + escapeHtml(message) + '</div>';",
      "}",
      '',
      '// Render environment file selector',
      'function renderEnvSelect(files) {',
      "  if (!files || files.length === 0) {",
      "    envSelect.style.display = 'none';",
      "    return;",
      "  }",
      "  envSelect.style.display = 'inline-block';",
      "  var options = '<option value=\"\">No Env</option>' +",
      "    files.map(function(f) {",
      "      return '<option value=\"' + f + '\">' + f + '</option>';",
      "    }).join('');",
      "  envSelect.innerHTML = options;",
      "}",
      '',
      '// Escape HTML to prevent XSS',
      'function escapeHtml(str) {',
      "  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;');",
      "}",
      '',
      "// Initial render",
      "renderSidebar([]);",
      "renderEditor(null);",
      "renderResponse(null);",
      "renderEnvSelect([]);",
      "</script>",
      "</body>",
      "</html>",
    ].join("\n");

    this.panel.webview.html = html;
  }
}
