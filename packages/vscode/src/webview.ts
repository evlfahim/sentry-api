import * as vscode from "vscode";
import {
  type Collection,
  type RequestFile,
  type Response,
  readRequest,
  updateRequest,
  listCollections,
} from "@sentry-api/core";

/**
 * Manages the main webview for the Sentry API extension.
 * Provides the UI for browsing collections, editing requests, and viewing responses.
 */
export class WebviewManager {
  public readonly webview: vscode.Webview;
  private _folderPath: string | undefined;
  private _activeEnvFile: string | undefined;
  private _currentRequest: RequestFile | undefined;
  private _response: Response | undefined;
  private _collections: Collection[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {
    this.webview = vscode.window.createWebviewPanel(
      "sentryApi",
      "Sentry API",
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    this.webview.onDidReceiveMessage(
      async (message: any) => {
        await this.handleMessage(message);
      },
      undefined,
      context.subscriptions
    );

    this.updateContent();
  }

  get folderPath(): string | undefined {
    return this._folderPath;
  }

  setFolder(path: string): void {
    this._folderPath = path;
    this.refreshCollections();
  }

  get activeEnvFile(): string | undefined {
    return this._activeEnvFile;
  }

  setActiveEnvFile(envFile: string): void {
    this._activeEnvFile = envFile;
  }

  get currentRequest(): RequestFile | undefined {
    return this._currentRequest;
  }

  setCurrentRequest(request: RequestFile): void {
    this._currentRequest = request;
  }

  async getCurrentRequest(): Promise<RequestFile | undefined> {
    if (this._currentRequest) {
      return this._currentRequest;
    }
    // Try to load the first request from the folder
    if (this._folderPath) {
      const collections = listCollections(this._folderPath);
      if (collections.length > 0) {
        const first = collections[0];
        if (first.requests.length > 0) {
          this._currentRequest = readRequest(
            this._folderPath,
            first.requests[0].id
          );
          return this._currentRequest;
        }
      }
    }
    return undefined;
  }

  async showResponse(response: Response): Promise<void> {
    this._response = response;
    this.updateContent();
  }

  async refreshCollections(): Promise<void> {
    if (!this._folderPath) return;

    try {
      const collections = listCollections(this._folderPath);
      this._collections = collections;
      this.updateContent();
    } catch (error) {
      console.error("Failed to refresh collections:", error);
    }
  }

  private async handleMessage(message: any): Promise<void> {
    switch (message.type) {
      case "folder-selected":
        this.setFolder(message.path);
        break;

      case "request-selected":
        if (this._folderPath) {
          const request = readRequest(this._folderPath, message.id);
          if (request) {
            this._currentRequest = request;
            this.updateContent();
          }
        }
        break;

      case "request-updated":
        if (this._folderPath && this._currentRequest) {
          this._currentRequest = {
            ...this._currentRequest,
            ...message.data,
            updated: new Date().toISOString(),
          };
          updateRequest(this._folderPath, this._currentRequest);
          this.updateContent();
        }
        break;

      case "env-file-selected":
        this.setActiveEnvFile(message.name);
        break;

      case "new-request":
        if (this._folderPath) {
          const request: RequestFile = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: message.name || "New Request",
            method: "GET",
            url: "",
            updated: new Date().toISOString(),
          };
          // Save request file
          const filePath = `${this._folderPath}/${request.id}.json`;
          await vscode.workspace.fs.writeFile(
            vscode.Uri.file(filePath),
            Buffer.from(JSON.stringify(request, null, 2))
          );
          this._currentRequest = request;
          await this.refreshCollections();
          this.updateContent();
        }
        break;
    }
  }

  private updateContent(): void {
    if (!this.webview) return;

    const cspSource = this.webview.cspSource;
    const collectionsData = JSON.stringify(this._collections);
    const currentRequestData = this._currentRequest
      ? JSON.stringify(this._currentRequest)
      : "null";
    const responseData = this._response
      ? JSON.stringify(this._response)
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
      '.editor { flex: 1; display: flex; flex-direction: column; padding: 16px; overflow-y: auto; }',
      '.editor label { font-size: 12px; color: #888; margin-bottom: 4px; display: block; }',
      '.editor input, .editor select, .editor textarea { width: 100%; background: #3c3c3c; border: 1px solid #555; color: #d4d4d4; padding: 8px; border-radius: 3px; font-size: 13px; margin-bottom: 12px; }',
      '.editor textarea { min-height: 100px; font-family: monospace; }',
      '.response { flex: 1; background: #1e1e1e; border-top: 1px solid #3c3c3c; overflow-y: auto; padding: 16px; }',
      '.response pre { font-family: monospace; font-size: 13px; white-space: pre-wrap; word-break: break-all; }',
      '.status-ok { color: #4ec9b0; }',
      '.status-error { color: #f44747; }',
      '.empty { display: flex; align-items: center; justify-content: center; height: 100%; color: #888; font-size: 14px; }',
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
      '<button id="send-btn">Send</button>',
      '<button id="new-btn">New Request</button>',
      '</div>',
      '<div class="editor" id="editor"></div>',
      '<div class="response" id="response"></div>',
      '</div>',
      '</div>',
      '<script>',
      'const vscode = acquireVsCodeApi();',
      'const sendBtn = document.getElementById("send-btn");',
      'const newBtn = document.getElementById("new-btn");',
      'sendBtn?.addEventListener("click", () => {',
      '  vscode.postMessage({ type: "send-request" });',
      "});",
      'newBtn?.addEventListener("click", () => {',
      '  vscode.postMessage({ type: "new-request" });',
      "});",
      'window.addEventListener("message", event => {',
      '  const message = event.data;',
      '  if (message.type === "update") {',
      '    renderSidebar(message.collections);',
      '    renderEditor(message.request);',
      '    renderResponse(message.response);',
      "  }",
      "});",
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
      'function renderEditor(request) {',
      '  const editor = document.getElementById("editor");',
      "  if (!request) {",
      "    editor.innerHTML = '<div class=\"empty\">Open a folder to get started</div>';",
      "    return;",
      "  }",
      "  var methodOptions = ['GET','POST','PUT','PATCH','DELETE'].map(function(m) {",
      "    return '<option value=\"' + m + '\"' + (m === request.method ? ' selected' : '') + '>' + m + '</option>';",
      "  }).join('');",
      "  editor.innerHTML = '<label>Method</label>' +",
      "    '<select id=\"method\">' + methodOptions + '</select>' +",
      "    '<label>URL</label>' +",
      "    '<input id=\"url\" value=\"' + (request.url || '') + '\" placeholder=\"https://api.example.com/endpoint\">' +",
      "    '<label>Headers (JSON)</label>' +",
      "    '<textarea id=\"headers\">' + JSON.stringify(request.headers || {}, null, 2) + '</textarea>' +",
      "    '<label>Query (JSON)</label>' +",
      "    '<textarea id=\"query\">' + JSON.stringify(request.query || {}, null, 2) + '</textarea>' +",
      "    '<label>Body</label>' +",
      "    '<textarea id=\"body\" placeholder=\"Request body (JSON)\"></textarea>';",
      "  editor.querySelector('#method')?.addEventListener('change', (e) => {",
      "    vscode.postMessage({ type: 'request-updated', data: { method: e.target.value } });",
      "  });",
      "  editor.querySelector('#url')?.addEventListener('change', (e) => {",
      "    vscode.postMessage({ type: 'request-updated', data: { url: e.target.value } });",
      "  });",
      "}",
      'function renderResponse(response) {',
      '  const el = document.getElementById("response");',
      "  if (!response) {",
      "    el.innerHTML = '<div class=\"empty\">Send a request to see the response</div>';",
      "    return;",
      "  }",
      "  var cls = response.status >= 200 && response.status < 300 ? 'status-ok' : 'status-error';",
      "  el.innerHTML = '<div style=\"margin-bottom:8px;\"><span class=\"' + cls + '\">' + response.status + ' ' + response.statusText + '</span> · ' + response.duration + 'ms</div>' +",
      "    '<pre>' + (typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2)) + '</pre>';",
      "}",
      "// Initial render",
      "renderSidebar([]);",
      "renderEditor(null);",
      "renderResponse(null);",
      "</script>",
      "</body>",
      "</html>",
    ].join("\n");

    this.webview.html = html;
  }
}
