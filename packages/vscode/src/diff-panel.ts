import * as vscode from "vscode";
import type { DiffResult } from "@sentry-api/core";
import { formatDiff } from "@sentry-api/core";

/**
 * A VS Code view that displays response diffs.
 * Shows differences between two API responses side by side.
 */
export class DiffPanel {
  private panel: vscode.WebviewPanel | undefined;
  private _diffs: DiffResult[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {}

  show(diffs: DiffResult[]): void {
    this._diffs = diffs;

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Two);
      this.updateContent();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "sentryApiDiff",
      "Response Diff",
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.updateContent();
  }

  private updateContent(): void {
    if (!this.panel) return;

    const cspSource = this.panel.webview.cspSource;
    const diffsJson = JSON.stringify(this._diffs);

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
      '<title>Response Diff</title>',
      '<style>',
      '* { margin: 0; padding: 0; box-sizing: border-box; }',
      'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #1e1e1e; color: #d4d4d4; }',
      '.container { padding: 16px; }',
      'h2 { font-size: 16px; margin-bottom: 12px; color: #ccc; }',
      '.diff-count { font-size: 12px; color: #888; margin-bottom: 12px; }',
      '.diff-item { padding: 8px 12px; margin-bottom: 4px; border-radius: 3px; font-family: monospace; font-size: 13px; }',
      '.diff-added { background: rgba(78, 201, 176, 0.1); border-left: 3px solid #4ec9b0; }',
      '.diff-removed { background: rgba(244, 71, 71, 0.1); border-left: 3px solid #f44747; }',
      '.diff-changed { background: rgba(204, 167, 9, 0.1); border-left: 3px solid #cca709; }',
      '.empty { color: #888; font-size: 14px; text-align: center; padding: 40px 0; }',
      '</style>',
      '</head>',
      '<body>',
      '<div class="container">',
      '<h2>Response Diff</h2>',
      '<div class="diff-count">0 difference(s) found</div>',
      '<div id="diff-list"></div>',
      '</div>',
      '<script>',
      'const diffs = ' + diffsJson + ';',
      'const diffList = document.getElementById("diff-list");',
      'function formatDiff(d) {',
      '  switch (d.type) {',
      "    case 'added': return '+ ' + d.path + ': ' + JSON.stringify(d.new);",
      "    case 'removed': return '- ' + d.path + ': ' + JSON.stringify(d.old);",
      "    case 'changed': return '~ ' + d.path + ': ' + JSON.stringify(d.old) + ' → ' + JSON.stringify(d.new);",
      "    default: return d.path + ': ' + JSON.stringify(d.old) + ' → ' + JSON.stringify(d.new);",
      '  }',
      '}',
      'function renderDiffs() {',
      '  if (!diffs || diffs.length === 0) {',
      "    diffList.innerHTML = '<div class=\"empty\">No differences found</div>';",
      '    return;',
      '  }',
      "  diffList.innerHTML = diffs.map(d => {",
      "    const cls = 'diff-' + d.type;",
      "    return '<div class=\"diff-item ' + cls + '\">' + formatDiff(d) + '</div>';",
      "  }).join('');",
      '}',
      'renderDiffs();',
      '</script>',
      '</body>',
      '</html>',
    ].join("\n");

    this.panel.webview.html = html;
  }
}
