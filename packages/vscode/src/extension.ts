import * as vscode from "vscode";
import {
  type Collection,
  type RequestFile,
  type RequestOptions,
  type Response,
  type ErrorResponse,
  type HistoryEntry,
  type DiffResult,
  createCollection,
  readCollection,
  readRequest,
  updateRequest,
  listCollections,
  sendRequest,
  interpolate,
  parseEnvFile,
  readEnvFile,
  buildRequest,
  toCurl,
  createHistoryStore,
  addToHistory,
  getHistoryEntry,
  replayEntry,
  diff,
  formatDiffs,
  isErrorResponse,
} from "@sentry-api/core";
import { WebviewManager } from "./webview";
import { HistoryPanel } from "./history-panel";
import { DiffPanel } from "./diff-panel";
import { VsCodeFileSystem } from "./vscode-fs";

let webviewManager: WebviewManager | undefined;
let historyPanel: HistoryPanel | undefined;
let diffPanel: DiffPanel | undefined;

// In-memory history store (shared between webview and panels)
const historyStore = createHistoryStore(1000);

/**
 * Creates a VsCodeFileSystem instance from a folder path string.
 */
function createFs(folderPath: string): VsCodeFileSystem {
  return new VsCodeFileSystem(vscode.Uri.file(folderPath));
}

export function activate(context: vscode.ExtensionContext) {
  console.log("Sentry API extension is now active");

  // Initialize webview manager
  webviewManager = new WebviewManager(context);

  // Register commands
  const openFolderCmd = vscode.commands.registerCommand(
    "sentry-api.openFolder",
    async () => {
      const folderUri = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        openLabel: "Open API Folder",
        title: "Select a folder containing API requests",
      });

      if (folderUri && folderUri[0]) {
        const folderPath = folderUri[0].fsPath;
        webviewManager?.setFolder(folderPath);
        vscode.window.showInformationMessage(
          `Sentry API folder set to: ${folderPath}`
        );
      }
    }
  );

  const newRequestCmd = vscode.commands.registerCommand(
    "sentry-api.newRequest",
    async () => {
      if (!webviewManager?.folderPath) {
        vscode.window.showErrorMessage(
          "No API folder selected. Use 'Sentry API: Open API Folder' first."
        );
        return;
      }

      const name = await vscode.window.showInputBox({
        prompt: "Enter request name",
        placeHolder: "My API Request",
      });

      if (!name) return;

      const request: RequestFile = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name,
        method: "GET",
        url: "",
        updated: new Date().toISOString(),
      };

      // Save request file via VS Code workspace API (step 11 integration)
      const fs = createFs(webviewManager.folderPath);
      await fs.createRequest(request);

      await webviewManager.refreshCollections();
      vscode.window.showInformationMessage(`Request "${name}" created.`);
    }
  );

  const sendRequestCmd = vscode.commands.registerCommand(
    "sentry-api.sendRequest",
    async () => {
      if (!webviewManager?.folderPath) {
        vscode.window.showErrorMessage(
          "No API folder selected. Use 'Sentry API: Open API Folder' first."
        );
        return;
      }

      // Show the webview so the user can see the response
      webviewManager.panel.reveal(vscode.ViewColumn.Two);

      // If there's a current request, send it via the webview
      const requestFile = await webviewManager.getCurrentRequest();
      if (!requestFile) {
        vscode.window.showErrorMessage("No request selected.");
        return;
      }

      // Set the current request in the webview manager
      webviewManager.setCurrentRequest(requestFile);

      // Send the request via the webview bridge
      webviewManager.postMessage({ type: "send-request" });
    }
  );

  const viewHistoryCmd = vscode.commands.registerCommand(
    "sentry-api.viewHistory",
    async () => {
      if (!webviewManager?.folderPath) {
        vscode.window.showErrorMessage(
          "No API folder selected. Use 'Sentry API: Open API Folder' first."
        );
        return;
      }

      if (!historyPanel) {
        historyPanel = new HistoryPanel(context.extensionUri);
      }

      historyPanel.show();
      historyPanel.setHistory(historyStore.entries);
    }
  );

  const diffResponsesCmd = vscode.commands.registerCommand(
    "sentry-api.diffResponses",
    async () => {
      if (!webviewManager?.folderPath) {
        vscode.window.showErrorMessage(
          "No API folder selected. Use 'Sentry API: Open API Folder' first."
        );
        return;
      }

      const history = historyStore.entries;
      if (history.length < 2) {
        vscode.window.showWarningMessage(
          "At least 2 history entries are needed to diff responses."
        );
        return;
      }

      // Let user pick two history entries
      const historyItems = history.map((entry, index) => ({
        label: `#${index + 1} - ${entry.request.method} ${entry.request.url} (${entry.response.status})`,
        description: new Date(entry.timestamp).toLocaleString(),
        entry,
        index,
      }));

      const first = await vscode.window.showQuickPick(historyItems, {
        placeHolder: "Select first request for diff",
      });
      if (!first) return;

      const second = await vscode.window.showQuickPick(historyItems, {
        placeHolder: "Select second request for diff",
      });
      if (!second) return;

      if (first.index === second.index) {
        vscode.window.showWarningMessage(
          "Please select two different requests."
        );
        return;
      }

      const diffResult = diff(
        first.entry.response.data,
        second.entry.response.data
      );

      if (!diffPanel) {
        diffPanel = new DiffPanel(context.extensionUri);
      }

      diffPanel.show(diffResult);
    }
  );

  const exportCurlCmd = vscode.commands.registerCommand(
    "sentry-api.exportCurl",
    async () => {
      if (!webviewManager?.folderPath) {
        vscode.window.showErrorMessage(
          "No API folder selected. Use 'Sentry API: Open API Folder' first."
        );
        return;
      }

      const requestFile = await webviewManager.getCurrentRequest();
      if (!requestFile) {
        vscode.window.showErrorMessage("No request selected.");
        return;
      }

      let envVars: Record<string, string> = {};
      if (webviewManager.activeEnvFile) {
        // Use VS Code file system to read env file (step 11 integration)
        const fs = createFs(webviewManager.folderPath);
        envVars = await fs.readEnvFile(webviewManager.activeEnvFile);
      }

      const options: RequestOptions = {
        method: requestFile.method,
        url: interpolate(requestFile.url, envVars),
        headers: requestFile.headers
          ? Object.fromEntries(
              Object.entries(requestFile.headers).map(([k, v]) => [
                k,
                interpolate(v, envVars),
              ])
            )
          : undefined,
        query: requestFile.query
          ? Object.fromEntries(
              Object.entries(requestFile.query).map(([k, v]) => [
                k,
                interpolate(String(v), envVars),
              ])
            )
          : undefined,
        body: requestFile.body,
      };

      const curl = toCurl(options);
      await vscode.env.clipboard.writeText(curl);
      vscode.window.showInformationMessage("cURL command copied to clipboard.");
    }
  );

  // ── Step 11: New commands that use VS Code file system APIs ────

  /**
   * Opens a collection folder and loads all requests from it.
   * Uses vscode.workspace.fs to read collection metadata and request files.
   */
  const openCollectionCmd = vscode.commands.registerCommand(
    "sentry-api.openCollection",
    async () => {
      if (!webviewManager?.folderPath) {
        vscode.window.showErrorMessage(
          "No API folder selected. Use 'Sentry API: Open API Folder' first."
        );
        return;
      }

      const fs = createFs(webviewManager.folderPath);
      const collections = await fs.listCollections();

      if (collections.length === 0) {
        vscode.window.showWarningMessage("No collections found in the selected folder.");
        return;
      }

      // Let user pick a collection
      const collectionItems = collections.map((col) => ({
        label: col.name,
        description: col.description || "No description",
        detail: `${col.requests.length} request(s)`,
        collection: col,
      }));

      const selected = await vscode.window.showQuickPick(collectionItems, {
        placeHolder: "Select a collection to open",
      });
      if (!selected) return;

      // Set the first request of the selected collection as current
      if (selected.collection.requests.length > 0) {
        const firstReq = selected.collection.requests[0];
        const request = await fs.readRequest(firstReq.id);
        if (request) {
          webviewManager.setCurrentRequest(request);
          webviewManager.postMessage({
            type: "update",
            collections,
            request,
            response: undefined,
            envFiles: [],
          });
          vscode.window.showInformationMessage(
            `Opened collection "${selected.collection.name}" with ${selected.collection.requests.length} request(s).`
          );
        }
      }
    }
  );

  /**
   * Saves the current request to disk using VS Code's workspace file system.
   * This is the core integration for step 11: saving requests directly from the plugin.
   */
  const saveRequestCmd = vscode.commands.registerCommand(
    "sentry-api.saveRequest",
    async () => {
      if (!webviewManager?.folderPath || !webviewManager.currentRequest) {
        vscode.window.showErrorMessage(
          "No request selected. Open a folder and select a request first."
        );
        return;
      }

      const fs = createFs(webviewManager.folderPath);
      try {
        await fs.updateRequest(webviewManager.currentRequest);
        vscode.window.showInformationMessage("Request saved.");
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to save request: ${error}`);
      }
    }
  );

  /**
   * Creates a new collection in the selected folder using VS Code file system.
   */
  const createCollectionCmd = vscode.commands.registerCommand(
    "sentry-api.createCollection",
    async () => {
      if (!webviewManager?.folderPath) {
        vscode.window.showErrorMessage(
          "No API folder selected. Use 'Sentry API: Open API Folder' first."
        );
        return;
      }

      const name = await vscode.window.showInputBox({
        prompt: "Enter collection name",
        placeHolder: "My API Collection",
      });
      if (!name) return;

      const description = await vscode.window.showInputBox({
        prompt: "Enter collection description (optional)",
        placeHolder: "A collection of API requests",
      });

      const fs = createFs(webviewManager.folderPath);
      const collection: Collection = {
        id: `collection-${Date.now()}`,
        name,
        description: description || undefined,
        requests: [],
        updated: new Date().toISOString(),
      };

      try {
        await fs.createCollection(collection);
        await webviewManager.refreshCollections();
        vscode.window.showInformationMessage(`Collection "${name}" created.`);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to create collection: ${error}`);
      }
    }
  );

  /**
   * Creates a new environment file in the selected folder.
   */
  const createEnvFileCmd = vscode.commands.registerCommand(
    "sentry-api.createEnvFile",
    async () => {
      if (!webviewManager?.folderPath) {
        vscode.window.showErrorMessage(
          "No API folder selected. Use 'Sentry API: Open API Folder' first."
        );
        return;
      }

      const name = await vscode.window.showInputBox({
        prompt: "Enter environment file name",
        placeHolder: ".env.development",
        value: ".env.",
      });
      if (!name) return;

      const fs = createFs(webviewManager.folderPath);
      try {
        await fs.writeEnvFile(name, {});
        await webviewManager.refreshCollections();
        vscode.window.showInformationMessage(`Environment file "${name}" created.`);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to create environment file: ${error}`);
      }
    }
  );

  /**
   * Opens a request file in the editor using VS Code's document APIs.
   * This integrates with VS Code's file system to open files directly.
   */
  const openRequestFileCmd = vscode.commands.registerCommand(
    "sentry-api.openRequestFile",
    async () => {
      if (!webviewManager?.folderPath || !webviewManager.currentRequest) {
        vscode.window.showErrorMessage(
          "No request selected. Open a folder and select a request first."
        );
        return;
      }

      const fs = createFs(webviewManager.folderPath);
      const uri = fs.file(`${webviewManager.currentRequest.id}.json`);

      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to open request file: ${error}`);
      }
    }
  );

  /**
   * Watches for external changes to request files in the folder.
   * Uses VS Code's file system watcher API.
   */
  const watchFilesCmd = vscode.commands.registerCommand(
    "sentry-api.watchFiles",
    async () => {
      if (!webviewManager?.folderPath) {
        vscode.window.showErrorMessage(
          "No API folder selected. Use 'Sentry API: Open API Folder' first."
        );
        return;
      }

      const folderUri = vscode.Uri.file(webviewManager.folderPath);

      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folderUri, "**/*.json")
      );

      watcher.onDidChange(async () => {
        await webviewManager?.refreshCollections();
        vscode.window.showInformationMessage("Request files changed, refreshing...");
      });

      watcher.onDidCreate(async () => {
        await webviewManager?.refreshCollections();
        vscode.window.showInformationMessage("New request file detected, refreshing...");
      });

      watcher.onDidDelete(async () => {
        await webviewManager?.refreshCollections();
        vscode.window.showInformationMessage("Request file deleted, refreshing...");
      });

      context.subscriptions.push(watcher);
      vscode.window.showInformationMessage("File watching enabled for API folder.");
    }
  );

  context.subscriptions.push(
    openFolderCmd,
    newRequestCmd,
    sendRequestCmd,
    viewHistoryCmd,
    diffResponsesCmd,
    exportCurlCmd,
    openCollectionCmd,
    saveRequestCmd,
    createCollectionCmd,
    createEnvFileCmd,
    openRequestFileCmd,
    watchFilesCmd
  );
}

export function deactivate() {
  console.log("Sentry API extension is now deactivated");
}
