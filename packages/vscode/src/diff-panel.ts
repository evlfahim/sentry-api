import * as vscode from "vscode";
import type { DiffResult } from "@sentry-api/core";
import { formatDiff } from "@sentry-api/core";

/**
 * A VS Code view that displays response diffs.
 * Shows differences between two API responses side by side.
 * Supports viewing full response data for each side.
 */
export class DiffPanel {
  private panel: vscode.WebviewPanel | undefined;
  private _diffs: DiffResult[] = [];
  private _leftResponse: unknown;
  private _rightResponse: unknown;
  private _leftLabel: string = "Response 1";
  private _rightLabel: string = "Response 2";

  constructor(private readonly extensionUri: vscode.Uri) {}

  show(
    diffs: DiffResult[],
    leftResponse?: unknown,
    rightResponse?: unknown,
    leftLabel?: string,
    rightLabel?: string
  ): void {
    this._diffs = diffs;
    this._leftResponse = leftResponse;
    this._rightResponse = rightResponse;
    this._leftLabel = leftLabel ?? "Response 1";
    this._rightLabel = rightLabel ?? "Response 2";

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

  /**
   * Disposes the webview panel and cleans up resources.
   */
  dispose(): void {
    if (this.panel) {
      this.panel.dispose();
      this.panel = undefined;
    }
  }

  private updateContent(): void {
    if (!this.panel) return;

    const cspSource = this.panel.webview.cspSource;
    const diffsJson = JSON.stringify(this._diffs);
    const leftResponseJson = JSON.stringify(this._leftResponse);
    const rightResponseJson = JSON.stringify(this._rightResponse);

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
      "* { margin: 0; padding: 0; box-sizing: border-box; }",
      'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #1e1e1e; color: #d4d4d4; }',
      '.container { padding: 16px; }',
      'h2 { font-size: 16px; margin-bottom: 12px; color: #ccc; }',
      '.diff-count { font-size: 12px; color: #888; margin-bottom: 12px; }',
      '.diff-count .added { color: #4ec9b0; }',
      '.diff-count .removed { color: #f44747; }',
      '.diff-count .changed { color: #cca709; }',
      '.diff-item { padding: 8px 12px; margin-bottom: 4px; border-radius: 3px; font-family: monospace; font-size: 13px; }',
      '.diff-added { background: rgba(78, 201, 176, 0.1); border-left: 3px solid #4ec9b0; }',
      '.diff-removed { background: rgba(244, 71, 71, 0.1); border-left: 3px solid #f44747; }',
      '.diff-changed { background: rgba(204, 167, 9, 0.1); border-left: 3px solid #cca709; }',
      '.empty { color: #888; font-size: 14px; text-align: center; padding: 40px 0; }',
      '.response-section { margin-top: 20px; }',
      '.response-section h3 { font-size: 14px; margin-bottom: 8px; color: #ccc; }',
      '.response-section pre { background: #252526; border: 1px solid #3c3c3c; border-radius: 4px; padding: 12px; font-family: monospace; font-size: 12px; max-height: 300px; overflow: auto; white-space: pre-wrap; word-break: break-all; }',
      '.toggle-btn { font-size: 12px; color: #0e639c; background: none; border: 1px solid #0e639c; padding: 4px 10px; border-radius: 3px; cursor: pointer; margin-bottom: 8px; }',
      '.toggle-btn:hover { background: #0e639c; color: #fff; }',
      '</style>',
      '</head>',
      '<body>',
      '<div class="container">',
      '<h2>Response Diff</h2>',
      '<div class="diff-count" id="diff-count"></div>',
      '<div id="diff-list"></div>',
      '<div class="response-section">',
      '<button class="toggle-btn" id="toggle-left">Show ' +
        '"{{LEFT_LABEL}}"</button>',
      '<pre id="left-response" style="display:none;"></pre>',
      '</div>',
      '<div class="response-section">',
      '<button class="toggle-btn" id="toggle-right">Show ' +
        '"{{RIGHT_LABEL}}"</button>',
      '<pre id="right-response" style="display:none;"></pre>',
      '</div>',
      '</div>',
      '<script>',
      'const diffs = ' + diffsJson + ';',
      'const leftResponse = ' + leftResponseJson + ';',
      'const rightResponse = ' + rightResponseJson + ';',
      'const diffList = document.getElementById("diff-list");',
      'const diffCount = document.getElementById("diff-count");',
      'const leftResponseEl = document.getElementById("left-response");',
      'const rightResponseEl = document.getElementById("right-response");',
      'const toggleLeftBtn = document.getElementById("toggle-left");',
      'const toggleRightBtn = document.getElementById("toggle-right");',
      '',
      'function formatDiff(d) {',
      "  switch (d.type) {",
      "    case 'added': return '+ ' + d.path + ': ' + JSON.stringify(d.new);",
      "    case 'removed': return '- ' + d.path + ': ' + JSON.stringify(d.old);",
      "    case 'changed': return '~ ' + d.path + ': ' + JSON.stringify(d.old) + ' → ' + JSON.stringify(d.new);",
      "    default: return d.path + ': ' + JSON.stringify(d.old) + ' → ' + JSON.stringify(d.new);",
      "  }",
      "}",
      '',
      'function renderDiffs() {',
      "  if (!diffs || diffs.length === 0) {",
      "    diffList.innerHTML = '<div class=\"empty\">No differences found</div>';",
      "    diffCount.textContent = 'No differences';",
      "    return;",
      "  }",
      "  var added = 0, removed = 0, changed = 0;",
      "  diffs.forEach(function(d) {",
      "    if (d.type === 'added') added++;",
      "    if (d.type === 'removed') removed++;",
      "    if (d.type === 'changed') changed++;",
      "  });",
      "  diffCount.innerHTML = '<span class=\"added\">+' + added + '</span> added, ' +",
      "    '<span class=\"removed\">-' + removed + '</span> removed, ' +",
      "    '<span class=\"changed\">~' + changed + '</span> changed';",
      "  diffList.innerHTML = diffs.map(d => {",
      "    var cls = 'diff-' + d.type;",
      "    return '<div class=\"diff-item ' + cls + '\">' + formatDiff(d) + '</div>';",
      "  }).join('');",
      "}",
      '',
      '// Toggle response visibility',
      'toggleLeftBtn?.addEventListener("click", function() {',
      "  var el = document.getElementById('left-response');",
      "  if (el.style.display === 'none') {",
      "    el.style.display = 'block';",
      "    toggleLeftBtn.textContent = 'Hide ' + '{{LEFT_LABEL}}';",
      "  } else {",
      "    el.style.display = 'none';",
      "    toggleLeftBtn.textContent = 'Show ' + '{{LEFT_LABEL}}';",
      "  }",
      "});",
      'toggleRightBtn?.addEventListener("click", function() {',
      "  var el = document.getElementById('right-response');",
      "  if (el.style.display === 'none') {",
      "    el.style.display = 'block';",
      "    toggleRightBtn.textContent = 'Hide ' + '{{RIGHT_LABEL}}';",
      "  } else {",
      "    el.style.display = 'none';",
      "    toggleRightBtn.textContent = 'Show ' + '{{RIGHT_LABEL}}';",
      "  }",
      "});",
      '',
      '// Render initial content',
      'renderDiffs();',
      'if (leftResponse !== undefined) {',
      "  leftResponseEl.textContent = JSON.stringify(leftResponse, null, 2);",
      "}",
      'if (rightResponse !== undefined) {',
      "  rightResponseEl.textContent = JSON.stringify(rightResponse, null, 2);",
      "}",
      "</script>",
      "</body>",
      "</html>",
    ].join("\n");

    // Replace template placeholders with actual labels
    const finalHtml = html
      .replace(/{{LEFT_LABEL}}/g, this._leftLabel)
      .replace(/{{RIGHT_LABEL}}/g, this._rightLabel);

    this.panel.webview.html = finalHtml;
  }
}
