import { describe, it, expect, vi, beforeEach } from "vitest";
import { DiffPanel } from "../src/diff-panel";
import type { DiffResult } from "@sentry-api/core";
import { WebviewPanel, window } from "./vscode-mock";

// ---- Helpers ----

function createMockDiffPanel(): { panel: DiffPanel } {
  WebviewPanel.reset();
  (window.createWebviewPanel as any).mockReset();

  const mockPanel = new WebviewPanel(
    "sentryApiDiff",
    "Response Diff",
    2,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  (window.createWebviewPanel as any).mockReturnValue(mockPanel);

  const panel = new DiffPanel({ scheme: "file", authority: "", path: "/test" } as any);
  return { panel };
}

function createMockDiffs(): DiffResult[] {
  return [
    {
      path: "name",
      old: "Alice",
      new: "Bob",
      type: "changed",
    },
    {
      path: "email",
      old: undefined,
      new: "bob@example.com",
      type: "added",
    },
    {
      path: "age",
      old: 30,
      new: undefined,
      type: "removed",
    },
  ];
}

// ---- Tests ----

describe("DiffPanel", () => {
  beforeEach(() => {
    WebviewPanel.reset();
    (window.createWebviewPanel as any).mockReset();
  });

  describe("show", () => {
    it("creates a webview panel on first show", () => {
      const { panel } = createMockDiffPanel();
      panel.show(createMockDiffs());

      expect(panel["panel"]).toBeDefined();
    });

    it("reveals existing panel on subsequent show", () => {
      const { panel } = createMockDiffPanel();
      panel.show(createMockDiffs());
      panel.show(createMockDiffs());

      // The reveal should have been called
      expect(panel["panel"]?.reveal).toHaveBeenCalled();
    });

    it("updates content on subsequent show", () => {
      const { panel } = createMockDiffPanel();
      panel.show(createMockDiffs());
      panel.show(createMockDiffs());

      // The updateContent should have been called (panel.reveal is called first)
      expect(panel["panel"]?.reveal).toHaveBeenCalled();
    });
  });

  describe("show with response data", () => {
    it("stores and renders left response data", () => {
      const { panel } = createMockDiffPanel();
      const diffs = createMockDiffs();
      const leftData = { name: "Alice", email: "alice@example.com" };
      const rightData = { name: "Bob", email: "bob@example.com" };

      panel.show(diffs, leftData, rightData, "Before", "After");

      const html = panel["panel"]?.webview.html ?? "";
      expect(html).toContain(JSON.stringify(leftData));
    });

    it("stores and renders right response data", () => {
      const { panel } = createMockDiffPanel();
      const diffs = createMockDiffs();
      const leftData = { name: "Alice" };
      const rightData = { name: "Bob" };

      panel.show(diffs, leftData, rightData, "Before", "After");

      const html = panel["panel"]?.webview.html ?? "";
      expect(html).toContain(JSON.stringify(rightData));
    });

    it("uses custom labels for toggle buttons", () => {
      const { panel } = createMockDiffPanel();
      const diffs = createMockDiffs();

      panel.show(diffs, { a: 1 }, { b: 2 }, "Response A", "Response B");

      const html = panel["panel"]?.webview.html ?? "";
      expect(html).toContain("Response A");
      expect(html).toContain("Response B");
    });

    it("uses default labels when not provided", () => {
      const { panel } = createMockDiffPanel();
      const diffs = createMockDiffs();

      panel.show(diffs);

      const html = panel["panel"]?.webview.html ?? "";
      expect(html).toContain("Response 1");
      expect(html).toContain("Response 2");
    });
  });

  describe("diff rendering", () => {
    it("renders diff count with added/removed/changed", () => {
      const { panel } = createMockDiffPanel();
      const diffs = createMockDiffs();

      panel.show(diffs);

      const html = panel["panel"]?.webview.html ?? "";
      expect(html).toContain("diff-count");
      expect(html).toContain("added");
      expect(html).toContain("removed");
      expect(html).toContain("changed");
    });

    it("renders diff items with correct CSS classes", () => {
      const { panel } = createMockDiffPanel();
      const diffs = createMockDiffs();

      panel.show(diffs);

      const html = panel["panel"]?.webview.html ?? "";
      expect(html).toContain("diff-added");
      expect(html).toContain("diff-removed");
      expect(html).toContain("diff-changed");
    });

    it("renders diff format strings", () => {
      const { panel } = createMockDiffPanel();
      const diffs = createMockDiffs();

      panel.show(diffs);

      const html = panel["panel"]?.webview.html ?? "";
      // Check for the formatDiff function in the HTML
      expect(html).toContain("formatDiff");
      expect(html).toContain("+ ");
      expect(html).toContain("- ");
      expect(html).toContain("~ ");
    });

    it("renders empty state when no diffs", () => {
      const { panel } = createMockDiffPanel();
      panel.show([]);

      const html = panel["panel"]?.webview.html ?? "";
      expect(html).toContain("No differences found");
    });

    it("renders toggle buttons for response sections", () => {
      const { panel } = createMockDiffPanel();
      const diffs = createMockDiffs();

      panel.show(diffs, { a: 1 }, { b: 2 });

      const html = panel["panel"]?.webview.html ?? "";
      expect(html).toContain("toggle-left");
      expect(html).toContain("toggle-right");
      expect(html).toContain("Show");
    });

    it("renders response data in pre elements", () => {
      const { panel } = createMockDiffPanel();
      const diffs = createMockDiffs();
      const leftData = { name: "Alice" };
      const rightData = { name: "Bob" };

      panel.show(diffs, leftData, rightData);

      const html = panel["panel"]?.webview.html ?? "";
      expect(html).toContain("left-response");
      expect(html).toContain("right-response");
      expect(html).toContain("JSON.stringify");
    });
  });

  describe("HTML content", () => {
    it("has correct CSP headers", () => {
      const { panel } = createMockDiffPanel();
      panel.show(createMockDiffs());

      const html = panel["panel"]?.webview.html ?? "";
      expect(html).toContain("Content-Security-Policy");
      expect(html).toContain("https://example.com");
    });

    it("has correct title", () => {
      const { panel } = createMockDiffPanel();
      panel.show(createMockDiffs());

      const html = panel["panel"]?.webview.html ?? "";
      expect(html).toContain("<title>Response Diff</title>");
    });

    it("has correct heading", () => {
      const { panel } = createMockDiffPanel();
      panel.show(createMockDiffs());

      const html = panel["panel"]?.webview.html ?? "";
      expect(html).toContain("<h2>Response Diff</h2>");
    });

    it("has dark theme styles", () => {
      const { panel } = createMockDiffPanel();
      panel.show(createMockDiffs());

      const html = panel["panel"]?.webview.html ?? "";
      expect(html).toContain("background: #1e1e1e");
      expect(html).toContain("color: #d4d4d4");
    });

    it("has diff color styles", () => {
      const { panel } = createMockDiffPanel();
      panel.show(createMockDiffs());

      const html = panel["panel"]?.webview.html ?? "";
      expect(html).toContain("rgba(78, 201, 176, 0.1)"); // added
      expect(html).toContain("rgba(244, 71, 71, 0.1)"); // removed
      expect(html).toContain("rgba(204, 167, 9, 0.1)"); // changed
    });
  });
});
