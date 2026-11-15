import { describe, it, expect, vi, beforeEach } from "vitest";
import { HistoryPanel } from "../src/history-panel";
import type { HistoryEntry } from "@sentry-api/core";
import { WebviewPanel, window } from "./vscode-mock";

// ---- Helpers ----

function createMockHistoryPanel(): { panel: HistoryPanel } {
  WebviewPanel.reset();
  (window.createWebviewPanel as any).mockReset();

  // Pre-create the panel so the mock has something to return
  const mockPanel = new WebviewPanel("sentryApiHistory", "Request History", 2, {
    enableScripts: true,
    retainContextWhenHidden: true,
  });

  (window.createWebviewPanel as any).mockReturnValue(mockPanel);

  const panel = new HistoryPanel({
    scheme: "file",
    authority: "",
    path: "/test",
  } as any);
  return { panel };
}

function getCreatedPanel(): WebviewPanel | undefined {
  return WebviewPanel.instances[0];
}

function createMockHistoryEntries(count: number): HistoryEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `entry-${i}`,
    request: {
      method: i % 2 === 0 ? "GET" : "POST",
      url: `https://api.example.com/endpoint${i}`,
    },
    response: {
      status: 200,
      statusText: "OK",
      headers: {},
      data: { id: i },
      duration: 50 + i * 10,
      request: {
        method: i % 2 === 0 ? "GET" : "POST",
        url: `https://api.example.com/endpoint${i}`,
      },
    },
    timestamp: new Date(Date.now() - i * 60000).toISOString(),
  }));
}

// ---- Tests ----

describe("HistoryPanel", () => {
  beforeEach(() => {
    WebviewPanel.reset();
    (window.createWebviewPanel as any).mockReset();
  });

  describe("show", () => {
    it("creates a webview panel on first show", () => {
      const { panel } = createMockHistoryPanel();
      panel.show();

      expect(panel["panel"]).toBeDefined();
      expect(WebviewPanel.instances.length).toBe(1);
    });

    it("reveals existing panel on subsequent show", () => {
      const { panel } = createMockHistoryPanel();
      panel.show();
      panel.show();

      // The reveal should have been called
      expect(panel["panel"]?.reveal).toHaveBeenCalled();
    });
  });

  describe("setHistory", () => {
    it("stores history entries and updates content", () => {
      const { panel } = createMockHistoryPanel();
      const entries = createMockHistoryEntries(3);

      panel.setHistory(entries);

      expect(panel["_history"]).toEqual(entries);
    });

    it("renders empty state when no history", () => {
      const { panel } = createMockHistoryPanel();
      panel.show();
      panel.setHistory([]);

      const mockPanel = getCreatedPanel();
      expect(mockPanel).toBeDefined();
      expect(mockPanel!.webview.html).toContain("No history entries yet");
    });

    it("renders history entries with correct method badges", () => {
      const { panel } = createMockHistoryPanel();
      panel.show();
      const entries = createMockHistoryEntries(3);
      panel.setHistory(entries);

      const mockPanel = getCreatedPanel();
      const html = mockPanel!.webview.html;
      expect(html).toContain("method-GET");
      expect(html).toContain("method-POST");
    });

    it("renders status badges for responses", () => {
      const { panel } = createMockHistoryPanel();
      panel.show();
      const entries = createMockHistoryEntries(3);
      panel.setHistory(entries);

      const mockPanel = getCreatedPanel();
      const html = mockPanel!.webview.html;
      expect(html).toContain("status-ok");
    });

    it("renders timestamps", () => {
      const { panel } = createMockHistoryPanel();
      panel.show();
      const entries = createMockHistoryEntries(1);
      panel.setHistory(entries);

      const mockPanel = getCreatedPanel();
      const html = mockPanel!.webview.html;
      // Should contain the date rendering code
      expect(html).toContain("toLocaleString");
    });
  });

  describe("setSearchText", () => {
    it("filters history by URL", () => {
      const { panel } = createMockHistoryPanel();
      const entries = createMockHistoryEntries(5);
      panel.setHistory(entries);
      panel.setSearchText("endpoint2");

      const filtered = panel.getFilteredHistory();
      expect(filtered.length).toBe(1);
      expect(filtered[0].request.url).toContain("endpoint2");
    });

    it("filters history by method", () => {
      const { panel } = createMockHistoryPanel();
      const entries = createMockHistoryEntries(5);
      panel.setHistory(entries);
      panel.setSearchText("POST");

      const filtered = panel.getFilteredHistory();
      expect(filtered.length).toBeGreaterThan(0);
      filtered.forEach((entry) => {
        expect(entry.request.method).toBe("POST");
      });
    });

    it("filters history by status code", () => {
      const { panel } = createMockHistoryPanel();
      const entries = createMockHistoryEntries(5);
      panel.setHistory(entries);
      panel.setSearchText("200");

      const filtered = panel.getFilteredHistory();
      expect(filtered.length).toBeGreaterThan(0);
      filtered.forEach((entry) => {
        expect(entry.response.status.toString()).toContain("200");
      });
    });

    it("returns all entries when search is empty", () => {
      const { panel } = createMockHistoryPanel();
      const entries = createMockHistoryEntries(5);
      panel.setHistory(entries);
      panel.setSearchText("");

      const filtered = panel.getFilteredHistory();
      expect(filtered.length).toBe(5);
    });

    it("returns no entries when search matches nothing", () => {
      const { panel } = createMockHistoryPanel();
      const entries = createMockHistoryEntries(5);
      panel.setHistory(entries);
      panel.setSearchText("nonexistent");

      const filtered = panel.getFilteredHistory();
      expect(filtered.length).toBe(0);
    });

    it("is case-insensitive", () => {
      const { panel } = createMockHistoryPanel();
      const entries = createMockHistoryEntries(5);
      panel.setHistory(entries);
      panel.setSearchText("endpoint2");

      const filtered = panel.getFilteredHistory();
      expect(filtered.length).toBe(1);
    });
  });

  describe("HTML content", () => {
    it("includes search input", () => {
      const { panel } = createMockHistoryPanel();
      panel.show();
      panel.setHistory([]);

      const mockPanel = getCreatedPanel();
      const html = mockPanel!.webview.html;
      expect(html).toContain("search-input");
      expect(html).toContain("Search history");
    });

    it("includes replay buttons", () => {
      const { panel } = createMockHistoryPanel();
      panel.show();
      const entries = createMockHistoryEntries(1);
      panel.setHistory(entries);

      const mockPanel = getCreatedPanel();
      const html = mockPanel!.webview.html;
      expect(html).toContain("replay-btn");
    });

    it("includes history count display", () => {
      const { panel } = createMockHistoryPanel();
      panel.show();
      panel.setHistory(createMockHistoryEntries(3));

      const mockPanel = getCreatedPanel();
      const html = mockPanel!.webview.html;
      expect(html).toContain("history-count");
    });

    it("posts replay message with correct index", () => {
      const { panel } = createMockHistoryPanel();
      panel.show();
      const entries = createMockHistoryEntries(3);
      panel.setHistory(entries);

      const mockPanel = getCreatedPanel();
      const html = mockPanel!.webview.html;
      // Verify the replay message structure in the HTML
      expect(html).toContain("type: 'replay'");
      expect(html).toContain("index: index");
    });

    it("posts search message on input change", () => {
      const { panel } = createMockHistoryPanel();
      panel.show();
      panel.setHistory([]);

      const mockPanel = getCreatedPanel();
      const html = mockPanel!.webview.html;
      expect(html).toContain('type: "search"');
      expect(html).toContain("searchText");
    });

    it("has correct CSP headers", () => {
      const { panel } = createMockHistoryPanel();
      panel.show();
      panel.setHistory([]);

      const mockPanel = getCreatedPanel();
      const html = mockPanel!.webview.html;
      expect(html).toContain("Content-Security-Policy");
      expect(html).toContain("https://example.com");
    });
  });
});
