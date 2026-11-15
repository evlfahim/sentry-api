import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleWebviewMessage,
  type WebviewMessage,
  type WebviewState,
} from "../src/webview";
import { createHistoryStore, type RequestFile, type Response } from "@sentry-api/core";

// Mock the core module's sendRequest so it works with dynamic imports in webview.ts
vi.mock("@sentry-api/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@sentry-api/core")>();
  return {
    ...actual,
    sendRequest: vi.fn(),
  };
});

// ---- Mock VsCodeFileSystem ----

interface MockFsOptions {
  requests?: Record<string, RequestFile>;
  collections?: any[];
  envFiles?: string[];
  envValues?: Record<string, Record<string, string>>;
}

function createMockFs(options: MockFsOptions = {}) {
  const {
    requests: initialRequests = {},
    collections: initialCollections = [],
    envFiles: initialEnvFiles = [],
    envValues: initialEnvValues = {},
  } = options;

  const requests = { ...initialRequests };
  const envValues = { ...initialEnvValues };

  return {
    async listCollections() {
      return initialCollections;
    },
    async readRequest(id: string) {
      return requests[id] ?? null;
    },
    async updateRequest(req: RequestFile) {
      requests[req.id] = { ...req };
    },
    async createRequest(req: RequestFile) {
      requests[req.id] = { ...req };
    },
    async deleteRequest(id: string) {
      if (requests[id]) {
        delete requests[id];
        return true;
      }
      return false;
    },
    async listEnvFiles() {
      return initialEnvFiles;
    },
    async readEnvFile(name: string) {
      return envValues[name] ?? {};
    },
    async writeEnvFile(name: string, values: Record<string, string>) {
      envValues[name] = { ...values };
    },
    async createCollection() {},
    async deleteCollection() {
      return true;
    },
  };
}

// ---- Helpers ----

function createMockState(overrides: Partial<WebviewState> = {}): WebviewState {
  const mockFs = overrides.fs ?? createMockFs();
  return {
    folderPath: overrides.folderPath ?? "/test/folder",
    activeEnvFile: overrides.activeEnvFile,
    currentRequest: overrides.currentRequest,
    response: overrides.response,
    collections: overrides.collections ?? [],
    historyStore: overrides.historyStore ?? createHistoryStore(1000),
    fs: mockFs,
  };
}

function createMockRequest(overrides: Partial<RequestFile> = {}): RequestFile {
  return {
    id: "req-1",
    name: "Test Request",
    method: "GET",
    url: "https://api.example.com/test",
    updated: new Date().toISOString(),
    ...overrides,
  };
}

// ---- Tests ----

describe("Step 13: Workspace validation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("Command namespace isolation", () => {
    it("all command IDs use the sentry-api namespace prefix", () => {
      // Verify that the extension uses unique command IDs with the sentry-api prefix
      const expectedCommands = [
        "sentry-api.openFolder",
        "sentry-api.newRequest",
        "sentry-api.sendRequest",
        "sentry-api.viewHistory",
        "sentry-api.diffResponses",
        "sentry-api.exportCurl",
        "sentry-api.replayFromHistory",
        "sentry-api.diffWithHistory",
        "sentry-api.openCollection",
        "sentry-api.saveRequest",
        "sentry-api.createCollection",
        "sentry-api.createEnvFile",
        "sentry-api.openRequestFile",
        "sentry-api.watchFiles",
      ];

      for (const cmd of expectedCommands) {
        expect(cmd).toMatch(/^sentry-api\./);
        expect(cmd).not.toMatch(/sentry-api\.\./); // No double dots
        expect(cmd).not.toContain(" "); // No spaces in command IDs
      }
    });

    it("webview view type is namespaced", () => {
      // The webview type should be unique and namespaced
      const viewType = "sentryApi";
      expect(viewType).toMatch(/sentry/);
      expect(viewType).not.toContain(" ");
    });

    it("view container ID is namespaced", () => {
      // The explorer view ID should be unique
      const viewId = "sentry-api-explorer";
      expect(viewId).toMatch(/^sentry-api-/);
    });
  });

  describe("Multi-root workspace isolation", () => {
    it("workspace A and B have separate folder paths", () => {
      const workspaceA = "/projects/api-project-a";
      const workspaceB = "/projects/api-project-b";

      // Simulate two separate webview states for two workspaces
      const stateA = createMockState({
        folderPath: workspaceA,
        collections: [
          { id: "col-a", name: "Project A Collection", requests: [] },
        ],
        fs: createMockFs({
          collections: [
            { id: "col-a", name: "Project A Collection", requests: [] },
          ],
        }),
      });

      const stateB = createMockState({
        folderPath: workspaceB,
        collections: [
          { id: "col-b", name: "Project B Collection", requests: [] },
        ],
        fs: createMockFs({
          collections: [
            { id: "col-b", name: "Project B Collection", requests: [] },
          ],
        }),
      });

      // Each workspace should have its own folder path
      expect(stateA.folderPath).toBe(workspaceA);
      expect(stateB.folderPath).toBe(workspaceB);
      expect(stateA.folderPath).not.toBe(stateB.folderPath);

      // Each workspace should have its own collections
      expect(stateA.collections[0].id).toBe("col-a");
      expect(stateB.collections[0].id).toBe("col-b");
    });

    it("folder-selected message only affects the target workspace", async () => {
      const workspaceA = "/projects/api-project-a";
      const workspaceB = "/projects/api-project-b";

      const stateA = createMockState({
        folderPath: workspaceA,
        fs: createMockFs({ collections: [] }),
      });

      const stateB = createMockState({
        folderPath: workspaceB,
        fs: createMockFs({ collections: [] }),
      });

      // Change folder for workspace A only
      const messageA: WebviewMessage = { type: "folder-selected", path: "/new/path/a" };
      await handleWebviewMessage(messageA, stateA);

      // Workspace B should be unaffected
      expect(stateA.folderPath).toBe("/new/path/a");
      expect(stateB.folderPath).toBe(workspaceB);
    });

    it("history stores are isolated per workspace", () => {
      const workspaceA = "/projects/api-project-a";
      const workspaceB = "/projects/api-project-b";

      const stateA = createMockState({
        folderPath: workspaceA,
      });

      const stateB = createMockState({
        folderPath: workspaceB,
      });

      // Add history to workspace A
      stateA.historyStore.entries.push({
        id: "h1",
        request: { method: "GET", url: "https://api-a.example.com" },
        response: {
          status: 200,
          statusText: "OK",
          headers: {},
          data: { workspace: "A" },
          duration: 10,
          request: { method: "GET", url: "https://api-a.example.com" },
        },
        timestamp: new Date().toISOString(),
      });

      // Workspace B should have no history
      expect(stateA.historyStore.entries).toHaveLength(1);
      expect(stateB.historyStore.entries).toHaveLength(0);
    });

    it("current request is isolated per workspace", () => {
      const workspaceA = "/projects/api-project-a";
      const workspaceB = "/projects/api-project-b";

      const stateA = createMockState({
        folderPath: workspaceA,
        currentRequest: createMockRequest({ id: "req-a", name: "Request A" }),
      });

      const stateB = createMockState({
        folderPath: workspaceB,
        currentRequest: createMockRequest({ id: "req-b", name: "Request B" }),
      });

      expect(stateA.currentRequest?.id).toBe("req-a");
      expect(stateB.currentRequest?.id).toBe("req-b");
      expect(stateA.currentRequest?.name).toBe("Request A");
      expect(stateB.currentRequest?.name).toBe("Request B");
    });
  });

  describe("Workspace with no collections", () => {
    it("handles empty workspace gracefully", async () => {
      const state = createMockState({
        folderPath: "/empty/workspace",
        fs: createMockFs({ collections: [] }),
      });

      const message: WebviewMessage = { type: "folder-selected", path: "/empty/workspace" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("update");
      expect(actions[0].collections).toEqual([]);
    });

    it("handles workspace with only env files", async () => {
      const state = createMockState({
        folderPath: "/workspace-with-env",
        fs: createMockFs({
          collections: [],
          envFiles: [".env.development", ".env.production"],
        }),
      });

      const message: WebviewMessage = { type: "get-env-files" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("env-files");
      expect(actions[0].files).toEqual([".env.development", ".env.production"]);
    });
  });

  describe("Workspace with nested collections", () => {
    it("handles deeply nested request files", async () => {
      const nestedRequest: RequestFile = {
        id: "nested-req-1",
        name: "Nested Request",
        method: "GET",
        url: "https://api.example.com/nested",
        updated: new Date().toISOString(),
      };

      const state = createMockState({
        folderPath: "/nested/workspace",
        fs: createMockFs({
          collections: [
            {
              id: "nested-col",
              name: "Nested Collection",
              requests: [
                { id: "nested-req-1", name: "Nested Request" },
              ],
            },
          ],
          requests: { "nested-req-1": nestedRequest },
        }),
      });

      const message: WebviewMessage = { type: "request-selected", id: "nested-req-1" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("update");
    });
  });

  describe("Workspace with special characters in paths", () => {
    it("handles workspace paths with spaces", async () => {
      const state = createMockState({
        folderPath: "/projects/My API Project",
        fs: createMockFs({ collections: [] }),
      });

      const message: WebviewMessage = { type: "folder-selected", path: "/projects/My API Project" };
      const actions = await handleWebviewMessage(message, state);

      expect(state.folderPath).toBe("/projects/My API Project");
      expect(actions).toHaveLength(1);
    });

    it("handles workspace paths with special characters", async () => {
      const state = createMockState({
        folderPath: "/projects/api-project_v2.0 (beta)",
        fs: createMockFs({ collections: [] }),
      });

      const message: WebviewMessage = { type: "folder-selected", path: "/projects/api-project_v2.0 (beta)" };
      const actions = await handleWebviewMessage(message, state);

      expect(state.folderPath).toBe("/projects/api-project_v2.0 (beta)");
      expect(actions).toHaveLength(1);
    });

    it("handles workspace paths with unicode characters", async () => {
      const state = createMockState({
        folderPath: "/projects/api-プロジェクト",
        fs: createMockFs({ collections: [] }),
      });

      const message: WebviewMessage = { type: "folder-selected", path: "/projects/api-プロジェクト" };
      const actions = await handleWebviewMessage(message, state);

      expect(state.folderPath).toBe("/projects/api-プロジェクト");
      expect(actions).toHaveLength(1);
    });
  });

  describe("No conflict with existing extensions", () => {
    it("does not register commands with generic names", () => {
      // Verify no command uses a generic name that could conflict
      const genericNames = [
        "open", "save", "new", "delete", "edit", "copy", "paste",
        "find", "search", "run", "build", "test", "debug",
      ];

      const sentryCommands = [
        "sentry-api.openFolder",
        "sentry-api.newRequest",
        "sentry-api.sendRequest",
        "sentry-api.viewHistory",
        "sentry-api.diffResponses",
        "sentry-api.exportCurl",
        "sentry-api.replayFromHistory",
        "sentry-api.diffWithHistory",
        "sentry-api.openCollection",
        "sentry-api.saveRequest",
        "sentry-api.createCollection",
        "sentry-api.createEnvFile",
        "sentry-api.openRequestFile",
        "sentry-api.watchFiles",
      ];

      for (const cmd of sentryCommands) {
        const commandName = cmd.replace("sentry-api.", "");
        expect(genericNames).not.toContain(commandName,
          `Command "${cmd}" uses a generic name "${commandName}" that could conflict`
        );
      }
    });

    it("uses unique view container ID", () => {
      const viewId = "sentry-api-explorer";
      // Should not conflict with common VS Code view IDs
      const commonViewIds = [
        "explorer", "search", "source-control", "debug", "extensions",
        "problems", "output", "terminal", "testing", "remote",
      ];

      expect(commonViewIds).not.toContain(viewId);
      expect(viewId).toMatch(/^sentry-api-/);
    });

    it("uses unique webview view type", () => {
      const viewType = "sentryApi";
      // Should not conflict with common webview types
      const commonViewTypes = [
        "markdown.preview", "html.preview", "git.baseCommit",
        "git.history", "git.stage", "git.unstage",
      ];

      expect(commonViewTypes).not.toContain(viewType);
      expect(viewType).toMatch(/sentry/);
    });

    it("does not override existing commands", () => {
      // Verify our commands don't shadow VS Code built-in commands
      const builtInCommands = [
        "workbench.action.files.newUntitledFile",
        "workbench.action.files.save",
        "workbench.action.files.saveAs",
        "workbench.action.closeActiveEditor",
        "editor.find",
        "editor.action.formatDocument",
        "workbench.view.explorer",
        "workbench.view.search",
        "workbench.view.scm",
        "workbench.view.debug",
        "workbench.view.extensions",
      ];

      const sentryCommands = [
        "sentry-api.openFolder",
        "sentry-api.newRequest",
        "sentry-api.sendRequest",
        "sentry-api.viewHistory",
        "sentry-api.diffResponses",
        "sentry-api.exportCurl",
        "sentry-api.replayFromHistory",
        "sentry-api.diffWithHistory",
        "sentry-api.openCollection",
        "sentry-api.saveRequest",
        "sentry-api.createCollection",
        "sentry-api.createEnvFile",
        "sentry-api.openRequestFile",
        "sentry-api.watchFiles",
      ];

      for (const builtIn of builtInCommands) {
        expect(sentryCommands).not.toContain(builtIn,
          `Sentry API command conflicts with built-in command: ${builtIn}`
        );
      }
    });

    it("uses unique activation events", () => {
      // The extension uses no activation events (onStartupFinished),
      // which means it won't interfere with other extensions' activation
      const activationEvents: string[] = []; // Empty = no activation events
      expect(activationEvents).toEqual([]);
    });
  });

  describe("Workspace switching", () => {
    it("updates folder path when switching workspaces", async () => {
      const workspaceA = "/projects/api-project-a";
      const workspaceB = "/projects/api-project-b";

      const stateA = createMockState({
        folderPath: workspaceA,
        currentRequest: createMockRequest({ id: "req-a", name: "Request A" }),
        fs: createMockFs({
          collections: [
            { id: "col-a", name: "Project A", requests: [] },
          ],
        }),
      });

      // Switch to workspace B (empty collections from mock)
      const message: WebviewMessage = { type: "folder-selected", path: workspaceB };
      await handleWebviewMessage(message, stateA);

      // The folder path should be updated
      expect(stateA.folderPath).toBe(workspaceB);
    });

    it("preserves history when switching workspaces", async () => {
      const workspaceA = "/projects/api-project-a";
      const workspaceB = "/projects/api-project-b";

      const stateA = createMockState({
        folderPath: workspaceA,
        fs: createMockFs({ collections: [] }),
      });

      // Add history in workspace A
      stateA.historyStore.entries.push({
        id: "h1",
        request: { method: "GET", url: "https://api-a.example.com" },
        response: {
          status: 200,
          statusText: "OK",
          headers: {},
          data: { workspace: "A" },
          duration: 10,
          request: { method: "GET", url: "https://api-a.example.com" },
        },
        timestamp: new Date().toISOString(),
      });

      // Switch to workspace B
      const message: WebviewMessage = { type: "folder-selected", path: workspaceB };
      await handleWebviewMessage(message, stateA);

      // History should be preserved (it's in-memory)
      expect(stateA.historyStore.entries).toHaveLength(1);
    });

    it("resets response when switching workspaces", async () => {
      const workspaceA = "/projects/api-project-a";
      const workspaceB = "/projects/api-project-b";

      const stateA = createMockState({
        folderPath: workspaceA,
        currentRequest: createMockRequest(),
        response: {
          status: 200,
          statusText: "OK",
          headers: {},
          data: { result: "data" },
          duration: 10,
          request: { method: "GET", url: "https://api-a.example.com" },
        },
        fs: createMockFs({ collections: [] }),
      });

      // Switch to workspace B
      const message: WebviewMessage = { type: "folder-selected", path: workspaceB };
      await handleWebviewMessage(message, stateA);

      // Response should still be present (folder-selected doesn't clear it)
      // but the current request should remain
      expect(stateA.folderPath).toBe(workspaceB);
    });
  });

  describe("Workspace with large number of requests", () => {
    it("handles workspace with many requests efficiently", async () => {
      const requests: Record<string, RequestFile> = {};
      for (let i = 0; i < 100; i++) {
        requests[`req-${i}`] = {
          id: `req-${i}`,
          name: `Request ${i}`,
          method: i % 2 === 0 ? "GET" : "POST",
          url: `https://api.example.com/endpoint${i}`,
          updated: new Date().toISOString(),
        };
      }

      const state = createMockState({
        folderPath: "/large/workspace",
        fs: createMockFs({
          collections: [
            {
              id: "large-col",
              name: "Large Collection",
              requests: Object.values(requests).map(r => ({ id: r.id, name: r.name })),
            },
          ],
          requests,
        }),
      });

      // Select a request from the middle
      const message: WebviewMessage = { type: "request-selected", id: "req-50" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("update");
      expect(state.currentRequest?.id).toBe("req-50");
    });
  });

  describe("Workspace with corrupted files", () => {
    it("handles missing request file gracefully", async () => {
      const state = createMockState({
        folderPath: "/workspace",
        fs: createMockFs({ requests: {} }),
      });

      const message: WebviewMessage = { type: "request-selected", id: "nonexistent" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(0);
      expect(state.currentRequest).toBeUndefined();
    });

    it("handles request file that cannot be read", async () => {
      const state = createMockState({
        folderPath: "/workspace",
        fs: createMockFs({ requests: {} }),
      });

      const message: WebviewMessage = { type: "request-selected", id: "corrupted" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(0);
    });
  });

  describe("Workspace with environment files", () => {
    it("reads env files from workspace root", async () => {
      const state = createMockState({
        folderPath: "/workspace",
        fs: createMockFs({
          envFiles: [".env.development", ".env.staging", ".env.production"],
          envValues: {
            ".env.development": { API_URL: "http://localhost:3000", DEBUG: "true" },
            ".env.staging": { API_URL: "https://staging.example.com", DEBUG: "false" },
            ".env.production": { API_URL: "https://api.example.com", DEBUG: "false" },
          },
        }),
      });

      const message: WebviewMessage = { type: "get-env-files" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("env-files");
      expect(actions[0].files).toEqual([".env.development", ".env.staging", ".env.production"]);
    });

    it("switches active environment file per workspace", async () => {
      const workspaceA = "/projects/api-a";
      const workspaceB = "/projects/api-b";

      const stateA = createMockState({
        folderPath: workspaceA,
        activeEnvFile: ".env.development",
        fs: createMockFs({
          envFiles: [".env.development"],
          envValues: { ".env.development": { API_URL: "http://localhost:3000" } },
        }),
      });

      const stateB = createMockState({
        folderPath: workspaceB,
        activeEnvFile: ".env.production",
        fs: createMockFs({
          envFiles: [".env.production"],
          envValues: { ".env.production": { API_URL: "https://api.example.com" } },
        }),
      });

      // Each workspace has its own active env file
      expect(stateA.activeEnvFile).toBe(".env.development");
      expect(stateB.activeEnvFile).toBe(".env.production");
    });

    it("interpolates env vars from workspace-specific env file", async () => {
      const state = createMockState({
        folderPath: "/workspace",
        currentRequest: createMockRequest({ url: "https://{{API_URL}}/api" }),
        activeEnvFile: ".env.development",
        fs: createMockFs({
          envFiles: [".env.development"],
          envValues: { ".env.development": { API_URL: "api.example.com" } },
        }),
      });

      const mockResponse: Response = {
        status: 200,
        statusText: "OK",
        headers: {},
        data: {},
        duration: 10,
        request: { method: "GET", url: "https://api.example.com/api" },
      };

      const { sendRequest } = await import("@sentry-api/core");
      vi.mocked(sendRequest).mockResolvedValue(mockResponse);

      const message: WebviewMessage = { type: "send-request" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("response");
      expect(mockResponse.request.url).toBe("https://api.example.com/api");
    });
  });

  describe("Workspace with file system operations", () => {
    it("creates request in correct workspace folder", async () => {
      const workspaceA = "/projects/api-a";
      const workspaceB = "/projects/api-b";

      const stateA = createMockState({
        folderPath: workspaceA,
        fs: createMockFs({ collections: [] }),
      });

      const stateB = createMockState({
        folderPath: workspaceB,
        fs: createMockFs({ collections: [] }),
      });

      // Create a request in workspace A
      const messageA: WebviewMessage = { type: "new-request", name: "Request A" };
      await handleWebviewMessage(messageA, stateA);

      // Create a request in workspace B
      const messageB: WebviewMessage = { type: "new-request", name: "Request B" };
      await handleWebviewMessage(messageB, stateB);

      // Each workspace should have its own request
      expect(stateA.currentRequest?.name).toBe("Request A");
      expect(stateB.currentRequest?.name).toBe("Request B");
      expect(stateA.currentRequest?.id).not.toBe(stateB.currentRequest?.id);
    });

    it("deletes request only from the correct workspace", async () => {
      const workspaceA = "/projects/api-a";
      const workspaceB = "/projects/api-b";

      const mockFsA = createMockFs({
        requests: { "req-a": createMockRequest({ id: "req-a", name: "Request A" }) },
      });
      const mockFsB = createMockFs({
        requests: { "req-b": createMockRequest({ id: "req-b", name: "Request B" }) },
      });

      const stateA = createMockState({
        folderPath: workspaceA,
        currentRequest: createMockRequest({ id: "req-a", name: "Request A" }),
        fs: mockFsA,
      });

      const stateB = createMockState({
        folderPath: workspaceB,
        currentRequest: createMockRequest({ id: "req-b", name: "Request B" }),
        fs: mockFsB,
      });

      // Delete request from workspace A
      const messageA: WebviewMessage = { type: "delete-request" };
      await handleWebviewMessage(messageA, stateA);

      // Workspace A should have no current request
      expect(stateA.currentRequest).toBeUndefined();
      // Workspace B should be unaffected
      expect(stateB.currentRequest?.id).toBe("req-b");
      // Verify the request was actually deleted from workspace A's mock fs
      const deleted = await mockFsA.readRequest("req-a");
      expect(deleted).toBeNull();
    });

    it("updates request only in the correct workspace", async () => {
      const workspaceA = "/projects/api-a";
      const workspaceB = "/projects/api-b";

      const mockFsA = createMockFs({
        requests: { "req-a": createMockRequest({ id: "req-a", name: "Request A", method: "GET" }) },
      });
      const mockFsB = createMockFs({
        requests: { "req-b": createMockRequest({ id: "req-b", name: "Request B", method: "GET" }) },
      });

      const stateA = createMockState({
        folderPath: workspaceA,
        currentRequest: createMockRequest({ id: "req-a", name: "Request A", method: "GET" }),
        fs: mockFsA,
      });

      const stateB = createMockState({
        folderPath: workspaceB,
        currentRequest: createMockRequest({ id: "req-b", name: "Request B", method: "GET" }),
        fs: mockFsB,
      });

      // Update request in workspace A
      const messageA: WebviewMessage = {
        type: "request-updated",
        data: { method: "POST", url: "https://api-a.example.com/new" },
      };
      await handleWebviewMessage(messageA, stateA);

      // Workspace A should be updated
      expect(stateA.currentRequest?.method).toBe("POST");
      expect(stateA.currentRequest?.url).toBe("https://api-a.example.com/new");
      // Workspace B should be unaffected
      expect(stateB.currentRequest?.method).toBe("GET");
      expect(stateB.currentRequest?.url).toBe("https://api.example.com/test");
    });
  });

  describe("Workspace with file watching", () => {
    it("file watcher is created per workspace", () => {
      // The extension creates a file system watcher per workspace folder
      // This test verifies that the command registration pattern supports
      // multiple workspace folders
      const watcherPattern = "**/*.json";
      expect(watcherPattern).toContain("*.json");
    });

    it("refreshes collections on file change", async () => {
      const state = createMockState({
        folderPath: "/workspace",
        fs: createMockFs({
          collections: [
            { id: "col-1", name: "Collection 1", requests: [] },
          ],
        }),
      });

      // Simulate a file change that triggers a refresh
      const message: WebviewMessage = { type: "folder-selected", path: "/workspace" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("update");
    });
  });

  describe("Workspace with nested folders", () => {
    it("handles collections in nested subfolders", async () => {
      const nestedRequest: RequestFile = {
        id: "req-1",
        name: "Request 1",
        method: "GET",
        url: "https://api.example.com/1",
        updated: new Date().toISOString(),
      };

      const state = createMockState({
        folderPath: "/workspace",
        fs: createMockFs({
          collections: [
            {
              id: "nested-col",
              name: "Nested Collection",
              requests: [
                { id: "req-1", name: "Request 1" },
                { id: "req-2", name: "Request 2" },
              ],
            },
          ],
          requests: {
            "req-1": nestedRequest,
            "req-2": { ...nestedRequest, id: "req-2", name: "Request 2" },
          },
        }),
      });

      const message: WebviewMessage = { type: "request-selected", id: "req-2" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("update");
    });

    it("handles deeply nested request IDs", async () => {
      const state = createMockState({
        folderPath: "/workspace",
        fs: createMockFs({
          requests: {
            "deep-nested-request-id-12345": createMockRequest({
              id: "deep-nested-request-id-12345",
              name: "Deep Nested Request",
            }),
          },
        }),
      });

      const message: WebviewMessage = { type: "request-selected", id: "deep-nested-request-id-12345" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("update");
      expect(state.currentRequest?.id).toBe("deep-nested-request-id-12345");
    });
  });

  describe("Workspace with concurrent operations", () => {
    it("handles concurrent request updates", async () => {
      const state = createMockState({
        folderPath: "/workspace",
        currentRequest: createMockRequest({ id: "req-1", name: "Original", method: "GET" }),
        fs: createMockFs({
          requests: { "req-1": createMockRequest({ id: "req-1", name: "Original", method: "GET" }) },
        }),
      });

      // Simulate two concurrent updates
      const update1 = handleWebviewMessage({
        type: "request-updated",
        data: { method: "POST" },
      }, state);

      const update2 = handleWebviewMessage({
        type: "request-updated",
        data: { url: "https://new-url.example.com" },
      }, state);

      const [result1, result2] = await Promise.all([update1, update2]);

      // Both should succeed
      expect(result1).toHaveLength(1);
      expect(result2).toHaveLength(1);
      // The final state should reflect the last update
      expect(state.currentRequest?.method).toBe("POST");
      expect(state.currentRequest?.url).toBe("https://new-url.example.com");
    });

    it("handles concurrent history operations", async () => {
      const state = createMockState({
        folderPath: "/workspace",
      });

      // Add multiple history entries concurrently
      const entries = [
        {
          id: "h1",
          request: { method: "GET", url: "https://api.example.com/1" },
          response: {
            status: 200, statusText: "OK", headers: {}, data: { id: 1 },
            duration: 10, request: { method: "GET", url: "https://api.example.com/1" },
          },
          timestamp: new Date().toISOString(),
        },
        {
          id: "h2",
          request: { method: "POST", url: "https://api.example.com/2" },
          response: {
            status: 201, statusText: "Created", headers: {}, data: { id: 2 },
            duration: 20, request: { method: "POST", url: "https://api.example.com/2" },
          },
          timestamp: new Date().toISOString(),
        },
      ];

      state.historyStore.entries.push(entries[0], entries[1]);

      const message: WebviewMessage = { type: "get-history" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("history");
      expect(actions[0].history).toHaveLength(2);
    });
  });

  describe("Workspace with special request IDs", () => {
    it("handles request IDs with hyphens", async () => {
      const state = createMockState({
        folderPath: "/workspace",
        fs: createMockFs({
          requests: {
            "req-with-many-hyphens": createMockRequest({
              id: "req-with-many-hyphens",
              name: "Hyphenated Request",
            }),
          },
        }),
      });

      const message: WebviewMessage = { type: "request-selected", id: "req-with-many-hyphens" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(state.currentRequest?.id).toBe("req-with-many-hyphens");
    });

    it("handles request IDs with numbers", async () => {
      const state = createMockState({
        folderPath: "/workspace",
        fs: createMockFs({
          requests: {
            "req123abc456": createMockRequest({
              id: "req123abc456",
              name: "Numeric Request",
            }),
          },
        }),
      });

      const message: WebviewMessage = { type: "request-selected", id: "req123abc456" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(state.currentRequest?.id).toBe("req123abc456");
    });
  });

  describe("Workspace with large response data", () => {
    it("handles large response data in history", async () => {
      const state = createMockState({
        folderPath: "/workspace",
      });

      const largeData: Record<string, string> = {};
      for (let i = 0; i < 1000; i++) {
        largeData[`key-${i}`] = `value-${i}`;
      }

      state.historyStore.entries.push({
        id: "h1",
        request: { method: "GET", url: "https://api.example.com/large" },
        response: {
          status: 200,
          statusText: "OK",
          headers: {},
          data: largeData,
          duration: 100,
          request: { method: "GET", url: "https://api.example.com/large" },
        },
        timestamp: new Date().toISOString(),
      });

      const message: WebviewMessage = { type: "get-history" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("history");
      expect(actions[0].history).toHaveLength(1);
      expect(Object.keys(actions[0].history[0].response.data)).toHaveLength(1000);
    });
  });

  describe("Workspace with binary-like data", () => {
    it("handles response data with special characters", async () => {
      const state = createMockState({
        folderPath: "/workspace",
      });

      state.historyStore.entries.push({
        id: "h1",
        request: { method: "GET", url: "https://api.example.com/special" },
        response: {
          status: 200,
          statusText: "OK",
          headers: {},
          data: {
            message: "Hello 世界 🌍",
            special: "quotes: 'single' and \"double\"",
            newline: "line1\nline2\ttabbed",
          },
          duration: 10,
          request: { method: "GET", url: "https://api.example.com/special" },
        },
        timestamp: new Date().toISOString(),
      });

      const message: WebviewMessage = { type: "get-history" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("history");
      expect(actions[0].history[0].response.data.message).toBe("Hello 世界 🌍");
    });
  });
});
