import * as vscode from "vscode";
import type { HistoryEntry } from "@sentry-api/core";

/**
 * A VS Code view that displays request history entries.
 * Users can click an entry to see details or replay it.
 */
export class HistoryPanel {
  private panel: vscode.WebviewPanel | undefined;
  private _history: HistoryEntry[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {}

  show(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Two);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "sentryApiHistory",
      "Request History",
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel.onDidReceiveMessage(
      async (message: any) => {
        if (message.type === "replay") {
          vscode.commands.executeCommand("sentry-api.sendRequest");
        }
      },
      undefined
    );

    this.updateContent();
  }

  setHistory(history: HistoryEntry[]): void {
    this._history = history;
    this.updateContent();
  }

  private updateContent(): void {
    if (!this.panel) return;

    const cspSource = this.panel.webview.cspSource;
    const historyJson = JSON.stringify(this._history);

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
      '<title>Request History</title>',
      '<style>',
      '* { margin: 0; padding: 0; box-sizing: border-box; }',
      'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #1e1e1e; color: #d4d4d4; }',
      '.container { padding: 16px; }',
      'h2 { font-size: 16px; margin-bottom: 12px; color: #ccc; }',
      '.history-item { background: #252526; border: 1px solid #3c3c3c; border-radius: 4px; padding: 12px; margin-bottom: 8px; cursor: pointer; }',
      '.history-item:hover { background: #2a2d2e; border-color: #0e639c; }',
      '.history-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }',
      '.method-badge { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 3px; min-width: 40px; text-align: center; }',
      '.method-GET { background: #61affe; color: #fff; }',
      '.method-POST { background: #49cc90; color: #fff; }',
      '.method-PUT { background: #fca130; color: #fff; }',
      '.method-DELETE { background: #f93e3e; color: #fff; }',
      '.method-PATCH { background: #50e3c2; color: #fff; }',
      '.status-badge { font-size: 12px; font-weight: 600; }',
      '.status-ok { color: #4ec9b0; }',
      '.status-error { color: #f44747; }',
      '.url { font-size: 13px; color: #9cdcfe; word-break: break-all; }',
      '.timestamp { font-size: 11px; color: #888; margin-top: 4px; }',
      '.empty { color: #888; font-size: 14px; text-align: center; padding: 40px 0; }',
      '</style>',
      '</head>',
      '<body>',
      '<div class="container">',
      '<h2>Request History</h2>',
      '<div id="history-list"></div>',
      '</div>',
      '<script>',
      'const vscode = acquireVsCodeApi();',
      'const historyList = document.getElementById("history-list");',
      'window.addEventListener("message", event => {',
      '  const message = event.data;',
      '  if (message.type === "update") {',
      '    renderHistory(message.history);',
      "  }",
      "});",
      'function renderHistory(history) {',
      "  if (!history || history.length === 0) {",
      "    historyList.innerHTML = '<div class=\"empty\">No history entries yet</div>';",
      "    return;",
      "  }",
      "  historyList.innerHTML = history.map(function(entry, index) {",
      "    var cls = entry.response.status >= 200 && entry.response.status < 300 ? 'status-ok' : 'status-error';",
      "    return '<div class=\"history-item\" data-index=\"' + index + '\">' +",
      "      '<div class=\"history-header\">' +",
      "        '<span class=\"method-badge method-' + entry.request.method + '\">' + entry.request.method + '</span>' +",
      "        '<span class=\"status-badge ' + cls + '\">' + entry.response.status + '</span>' +",
      "        '<span style=\"font-size:12px;color:#888;\">' + entry.response.duration + 'ms</span>' +",
      "      '</div>' +",
      "      '<div class=\"url\">' + entry.request.url + '</div>' +",
      "      '<div class=\"timestamp\">' + new Date(entry.timestamp).toLocaleString() + '</div>' +",
      "    '</div>';",
      "  }).join('');",
      "  historyList.querySelectorAll('.history-item').forEach(function(item) {",
      "    item.addEventListener('click', function() {",
      "      var index = parseInt(item.dataset.index);",
      "      vscode.postMessage({ type: 'replay', index: index });",
      "    });",
      "  });",
      "}",
      "// Initial render",
      "renderHistory([]);",
      "</script>",
      "</body>",
      "</html>",
    ].join("\n");

    this.panel.html = html;
  }
}
