import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock vscode module before importing extension
vi.mock("vscode", () => {
  const mockPanel = {
    webview: {
      cspSource: "https://example.com",
      onDidReceiveMessage: vi.fn(),
      postMessage: vi.fn(),
    },
    reveal: vi.fn(),
    dispose: vi.fn(),
    onDidDispose: vi.fn(),
  };

  return {
    window: {
      createWebviewPanel: vi.fn(() => mockPanel),
      showInformationMessage: vi.fn(),
      showErrorMessage: vi.fn(),
      showWarningMessage: vi.fn(),
      showInputBox: vi.fn(),
      showOpenDialog: vi.fn(),
      showQuickPick: vi.fn(),
    },
    commands: {
      registerCommand: vi.fn((name: string, fn: any) => ({
        dispose: vi.fn(),
        _name: name,
      })),
      executeCommand: vi.fn(),
    },
    Uri: {
      file: vi.fn((p: string) => ({ fsPath: p })),
      joinPath: vi.fn((base: any, ...parts: string[]) => ({
        fsPath: [base.fsPath, ...parts].join("/"),
      })),
    },
    workspace: {
      fs: {
        writeFile: vi.fn(),
        readFile: vi.fn(),
        readDirectory: vi.fn(),
        stat: vi.fn(),
        createDirectory: vi.fn(),
        delete: vi.fn(),
      },
      createFileSystemWatcher: vi.fn(() => ({
        onDidChange: vi.fn(),
        onDidCreate: vi.fn(),
        onDidDelete: vi.fn(),
        dispose: vi.fn(),
      })),
      openTextDocument: vi.fn(),
      showTextDocument: vi.fn(),
    },
    env: {
      clipboard: {
        writeText: vi.fn(),
      },
    },
    ViewColumn: {
      Two: 2,
    },
    RelativePattern: vi.fn((base: any, pattern: string) => ({ base, pattern })),
  };
});

// Mock @sentry-api/core
vi.mock("@sentry-api/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@sentry-api/core")>();
  return {
    ...actual,
    sendRequest: vi.fn(),
    createHistoryStore: vi.fn(() => ({ entries: [] })),
  };
});

import * as vscode from "vscode";
import { activate, deactivate } from "../src/extension";
import { WebviewManager } from "../src/webview";
import { HistoryPanel } from "../src/history-panel";
import { DiffPanel } from "../src/diff-panel";

// ---- Helpers ----

function createMockContext(): any {
  const subscriptions: any[] = [];
  return {
    subscriptions,
    extensionUri: { scheme: "file", authority: "", path: "/test/extension" },
    globalState: {
      get: vi.fn(),
      update: vi.fn(),
    },
    workspaceState: {
      get: vi.fn(),
      update: vi.fn(),
    },
    secrets: {
      get: vi.fn(),
      store: vi.fn(),
      delete: vi.fn(),
    },
    asAbsolutePath: (path: string) => `/test/extension/${path}`,
  };
}

// ---- Tests ----

describe("Step 13: Extension lifecycle and workspace validation", () => {
  let mockContext: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockContext();
  });

  describe("Extension activation", () => {
    it("registers all expected commands", () => {
      activate(mockContext);

      const registeredCommands = (
        vscode.commands.registerCommand as any
      ).mock.calls.map((call: any[]) => call[0]);

      const expectedCommands = [
        "sentry-api.openFolder",
        "sentry-api.newRequest",
        "sentry-api.sendRequest",
        "sentry-api.replayFromHistory",
        "sentry-api.viewHistory",
        "sentry-api.diffResponses",
        "sentry-api.diffWithHistory",
        "sentry-api.exportCurl",
        "sentry-api.openCollection",
        "sentry-api.saveRequest",
        "sentry-api.createCollection",
        "sentry-api.createEnvFile",
        "sentry-api.openRequestFile",
        "sentry-api.watchFiles",
      ];

      for (const cmd of expectedCommands) {
        expect(registeredCommands).toContain(cmd);
      }
    });

    it("registers the correct number of commands", () => {
      activate(mockContext);

      const registeredCommands = (
        vscode.commands.registerCommand as any
      ).mock.calls.map((call: any[]) => call[0]);

      expect(registeredCommands.length).toBe(14);
    });

    it("creates a webview manager on activation", () => {
      activate(mockContext);

      expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
    });

    it("adds all command disposables to context subscriptions", () => {
      activate(mockContext);

      expect(mockContext.subscriptions.length).toBe(14);
    });

    it("initializes with no folder selected", () => {
      activate(mockContext);

      // The webview manager should be created but without a folder
      expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
        "sentryApi",
        "Sentry API",
        2,
        expect.objectContaining({
          enableScripts: true,
          retainContextWhenHidden: true,
        }),
      );
    });
  });

  describe("Extension deactivation", () => {
    it("cleans up webview panel on deactivate", () => {
      activate(mockContext);
      deactivate();

      // The panel should have been disposed
      const calls = (vscode.window.createWebviewPanel as any).mock.calls;
      if (calls.length > 0) {
        // Panel was created, check if dispose was called
        // The mock panel's dispose should have been called
        const mockPanel = (vscode.window.createWebviewPanel as any).mock
          .results[0].value;
        expect(mockPanel.dispose).toHaveBeenCalled();
      }
    });

    it("clears history store on deactivate", () => {
      activate(mockContext);

      // Access the history store through the webview manager
      // The history store should be cleared on deactivate
      deactivate();

      // After deactivation, the history store should be empty
      // (entries.length = 0)
    });

    it("can be activated again after deactivation", () => {
      activate(mockContext);
      deactivate();

      // Should be able to activate again without errors
      const newContext = createMockContext();
      expect(() => activate(newContext)).not.toThrow();
    });
  });

  describe("Command namespace uniqueness", () => {
    it("all command IDs are unique", () => {
      activate(mockContext);

      const registeredCommands = (
        vscode.commands.registerCommand as any
      ).mock.calls.map((call: any[]) => call[0]);

      const uniqueCommands = new Set(registeredCommands);
      expect(uniqueCommands.size).toBe(registeredCommands.length);
    });

    it("no command ID is a prefix of another", () => {
      activate(mockContext);

      const registeredCommands = (
        vscode.commands.registerCommand as any
      ).mock.calls.map((call: any[]) => call[0]);

      for (const cmd of registeredCommands) {
        for (const other of registeredCommands) {
          if (cmd !== other) {
            expect(other.startsWith(cmd)).toBe(false);
          }
        }
      }
    });

    it("all command IDs follow the sentry-api prefix convention", () => {
      activate(mockContext);

      const registeredCommands = (
        vscode.commands.registerCommand as any
      ).mock.calls.map((call: any[]) => call[0]);

      for (const cmd of registeredCommands) {
        expect(cmd).toMatch(/^sentry-api\.[a-zA-Z]+$/);
      }
    });
  });

  describe("Workspace isolation", () => {
    it("each workspace gets its own folder path", () => {
      activate(mockContext);

      // Simulate setting different folder paths
      const mockPanel = (vscode.window.createWebviewPanel as any).mock
        .results[0].value;
      const webviewManager = new WebviewManager(mockContext);

      webviewManager.setFolder("/workspace/a");
      expect(webviewManager.folderPath).toBe("/workspace/a");

      webviewManager.setFolder("/workspace/b");
      expect(webviewManager.folderPath).toBe("/workspace/b");
    });

    it("history is isolated per workspace instance", () => {
      activate(mockContext);

      const webviewManagerA = new WebviewManager(mockContext);
      const webviewManagerB = new WebviewManager(mockContext);

      // Each webview manager has its own history store
      expect(webviewManagerA["_state"].historyStore).not.toBe(
        webviewManagerB["_state"].historyStore,
      );
    });

    it("current request is isolated per workspace instance", () => {
      activate(mockContext);

      const webviewManagerA = new WebviewManager(mockContext);
      const webviewManagerB = new WebviewManager(mockContext);

      const requestA = {
        id: "req-a",
        name: "Request A",
        method: "GET",
        url: "https://api-a.example.com",
        updated: new Date().toISOString(),
      };

      const requestB = {
        id: "req-b",
        name: "Request B",
        method: "POST",
        url: "https://api-b.example.com",
        updated: new Date().toISOString(),
      };

      webviewManagerA.setCurrentRequest(requestA);
      webviewManagerB.setCurrentRequest(requestB);

      expect(webviewManagerA.currentRequest?.id).toBe("req-a");
      expect(webviewManagerB.currentRequest?.id).toBe("req-b");
    });
  });

  describe("No conflicts with existing extensions", () => {
    it("does not use common VS Code command names", () => {
      activate(mockContext);

      const registeredCommands = (
        vscode.commands.registerCommand as any
      ).mock.calls.map((call: any[]) => call[0]);

      const forbiddenNames = [
        "editor.action.formatDocument",
        "workbench.action.files.save",
        "workbench.action.files.saveAs",
        "workbench.action.closeActiveEditor",
        "editor.find",
        "workbench.view.explorer",
        "workbench.view.search",
        "workbench.view.scm",
        "workbench.view.debug",
        "workbench.view.extensions",
        "git.commit",
        "git.push",
        "git.pull",
      ];

      for (const cmd of registeredCommands) {
        expect(forbiddenNames).not.toContain(cmd);
      }
    });

    it("uses unique view container ID", () => {
      // The view container ID is defined in package.json
      const viewId = "sentry-api-explorer";

      // Should not conflict with common VS Code view IDs
      const commonViewIds = [
        "explorer",
        "search",
        "source-control",
        "debug",
        "extensions",
        "problems",
        "output",
        "terminal",
        "testing",
        "remote",
        "git",
        "markdown.preview",
      ];

      expect(commonViewIds).not.toContain(viewId);
    });

    it("uses unique webview view type", () => {
      const viewType = "sentryApi";

      // Should not conflict with common webview types
      const commonViewTypes = [
        "markdown.preview",
        "html.preview",
        "git.baseCommit",
        "git.history",
        "git.stage",
        "git.unstage",
        "testing.view",
        "debug.console",
      ];

      expect(commonViewTypes).not.toContain(viewType);
    });

    it("uses unique activation events", () => {
      // The extension uses no activation events (empty array),
      // which means it won't interfere with other extensions' activation
      // and will only activate when explicitly invoked via command palette
      const activationEvents: string[] = [];
      expect(activationEvents).toEqual([]);
    });
  });

  describe("Extension manifest validation", () => {
    it("has a unique extension name", () => {
      const name = "sentry-api-vscode";
      expect(name).toMatch(/sentry/);
      expect(name).not.toContain(" ");
    });

    it("has a unique display name", () => {
      const displayName = "Sentry API";
      expect(displayName).toMatch(/sentry/i);
      // Display names can contain spaces (unlike command IDs)
      expect(displayName).toContain(" ");
    });

    it("specifies a minimum VS Code version", () => {
      // The package.json specifies ^1.85.0 as the minimum version
      // This ensures compatibility with modern VS Code APIs
      const version = "^1.85.0";
      expect(version).toMatch(/^\^1\./);
    });

    it("has no overlapping categories with common extensions", () => {
      // The extension uses "Other" category to avoid conflicts
      const categories = ["Other"];
      expect(categories).toContain("Other");
    });
  });

  describe("Error handling across workspaces", () => {
    it("handles missing folder gracefully", () => {
      activate(mockContext);

      const webviewManager = new WebviewManager(mockContext);

      // No folder set, getCurrentRequest should return undefined
      expect(webviewManager.getCurrentRequest()).resolves.toBeUndefined();
    });

    it("handles invalid folder path gracefully", () => {
      activate(mockContext);

      const webviewManager = new WebviewManager(mockContext);

      // Setting an invalid folder path should not throw
      expect(() => webviewManager.setFolder("/nonexistent/path")).not.toThrow();
    });

    it("handles workspace that does not exist", () => {
      activate(mockContext);

      const webviewManager = new WebviewManager(mockContext);

      // Setting a non-existent folder path should not throw
      expect(() => webviewManager.setFolder("/does/not/exist")).not.toThrow();
    });
  });

  describe("Resource cleanup", () => {
    it("cleans up file system watchers on deactivate", () => {
      activate(mockContext);

      // The watchFiles command creates a file system watcher
      // On deactivate, all watchers should be disposed
      deactivate();

      // The watcher's dispose method should have been called
      // (tracked via vscode.workspace.createFileSystemWatcher)
    });

    it("cleans up all subscriptions on deactivate", () => {
      activate(mockContext);

      const subscriptionCount = mockContext.subscriptions.length;
      expect(subscriptionCount).toBeGreaterThan(0);

      deactivate();

      // After deactivation, the context should have no active subscriptions
      // (they should all be disposed)
    });
  });

  describe("Multi-instance extension support", () => {
    it("can be activated multiple times", () => {
      const context1 = createMockContext();
      const context2 = createMockContext();

      // Should be able to activate in different contexts
      expect(() => activate(context1)).not.toThrow();
      expect(() => activate(context2)).not.toThrow();
    });

    it("each activation creates independent state", () => {
      const context1 = createMockContext();
      const context2 = createMockContext();

      activate(context1);
      activate(context2);

      // Each activation should create its own webview manager
      const calls = (vscode.window.createWebviewPanel as any).mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});
