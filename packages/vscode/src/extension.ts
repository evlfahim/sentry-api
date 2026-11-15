import * as vscode from "vscode";
import {
  type Collection,
  type RequestFile,
  type RequestOptions,
  type Response,
  type ErrorResponse,
  type HistoryEntry,
  type HistoryStore,
  type DiffResult,
  type Environment,
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

let webviewManager: WebviewManager | undefined;
let historyPanel: HistoryPanel | undefined;
let diffPanel: DiffPanel | undefined;

// In-memory history store
const historyStore: HistoryStore = createHistoryStore(1000);

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
        await webviewManager?.setFolder(folderPath);
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

      // Save request file
      const filePath = `${webviewManager.folderPath}/${request.id}.json`;
      await vscode.workspace.fs.writeFile(
        vscode.Uri.file(filePath),
        Buffer.from(JSON.stringify(request, null, 2))
      );

      await webviewManager?.refreshCollections();
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

      const requestFile = await webviewManager.getCurrentRequest();
      if (!requestFile) {
        vscode.window.showErrorMessage("No request selected.");
        return;
      }

      try {
        // Interpolate environment variables
        let envVars: Record<string, string> = {};
        if (webviewManager.activeEnvFile) {
          const envFile = readEnvFile(
            `${webviewManager.folderPath}/${webviewManager.activeEnvFile}`
          );
          envVars = envFile.values;
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

        const result = await sendRequest(options);

        if (isErrorResponse(result)) {
          vscode.window.showErrorMessage(
            `Request failed: ${result.error}${result.details ? ` - ${JSON.stringify(result.details)}` : ""}`
          );
          return;
        }

        const response = result as Response;

        // Add to history
        addToHistory(historyStore, options, response);

        await webviewManager?.showResponse(response);
        vscode.window.showInformationMessage(
          `Request completed with status ${response.status}`
        );
      } catch (error) {
        const err = error as Error;
        vscode.window.showErrorMessage(`Request failed: ${err.message}`);
      }
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
        const envFile = readEnvFile(
          `${webviewManager.folderPath}/${webviewManager.activeEnvFile}`
        );
        envVars = envFile.values;
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
                interpolate(v, envVars),
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

  context.subscriptions.push(
    openFolderCmd,
    newRequestCmd,
    sendRequestCmd,
    viewHistoryCmd,
    diffResponsesCmd,
    exportCurlCmd
  );
}

export function deactivate() {
  console.log("Sentry API extension is now deactivated");
}
