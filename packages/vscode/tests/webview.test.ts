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

describe("handleWebviewMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("folder-selected", () => {
    it("sets the folder path and returns update action", async () => {
      const state = createMockState({
        folderPath: "/old/path",
        fs: createMockFs({ collections: [] }),
      });
      const message: WebviewMessage = { type: "folder-selected", path: "/new/folder" };

      const actions = await handleWebviewMessage(message, state);

      expect(state.folderPath).toBe("/new/folder");
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("update");
    });
  });

  describe("request-selected", () => {
    it("loads a request and returns update action", async () => {
      const mockRequest = createMockRequest({ id: "req-2", name: "Loaded Request" });
      const state = createMockState({
        fs: createMockFs({ requests: { "req-2": mockRequest } }),
      });

      const message: WebviewMessage = { type: "request-selected", id: "req-2" };
      const actions = await handleWebviewMessage(message, state);

      expect(state.currentRequest).toEqual(mockRequest);
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("update");
    });

    it("does nothing when folder is not set", async () => {
      const state: WebviewState = {
        folderPath: undefined,
        activeEnvFile: undefined,
        currentRequest: undefined,
        response: undefined,
        collections: [],
        historyStore: createHistoryStore(1000),
        fs: undefined,
      };
      const message: WebviewMessage = { type: "request-selected", id: "req-1" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(0);
    });

    it("does nothing when request file does not exist", async () => {
      const state = createMockState({
        fs: createMockFs({ requests: {} }),
      });

      const message: WebviewMessage = { type: "request-selected", id: "nonexistent" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(0);
    });
  });

  describe("request-updated", () => {
    it("updates the current request and persists it", async () => {
      const mockRequest = createMockRequest({ method: "GET", url: "https://old.com" });
      const state = createMockState({
        currentRequest: mockRequest,
        fs: createMockFs({ requests: { "req-1": mockRequest } }),
      });

      const message: WebviewMessage = {
        type: "request-updated",
        data: { method: "POST", url: "https://new.com" },
      };
      const actions = await handleWebviewMessage(message, state);

      expect(state.currentRequest?.method).toBe("POST");
      expect(state.currentRequest?.url).toBe("https://new.com");
      expect(state.currentRequest?.updated).toBeDefined();
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("update");
    });

    it("persists the update in the mock file system", async () => {
      const mockRequest = createMockRequest({ method: "GET", url: "https://old.com" });
      const mockFs = createMockFs({ requests: { "req-1": mockRequest } });
      const state = createMockState({
        currentRequest: mockRequest,
        fs: mockFs,
      });

      const message: WebviewMessage = {
        type: "request-updated",
        data: { method: "POST" },
      };
      await handleWebviewMessage(message, state);

      // Verify the mock fs was updated
      const persisted = await mockFs.readRequest("req-1");
      expect(persisted?.method).toBe("POST");
    });

    it("does nothing when no current request", async () => {
      const state: WebviewState = {
        folderPath: "/test/folder",
        activeEnvFile: undefined,
        currentRequest: undefined,
        response: undefined,
        collections: [],
        historyStore: createHistoryStore(1000),
        fs: createMockFs(),
      };
      const message: WebviewMessage = {
        type: "request-updated",
        data: { method: "POST" },
      };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(0);
    });
  });

  describe("env-file-selected", () => {
    it("sets the active environment file", async () => {
      const state = createMockState();
      const message: WebviewMessage = { type: "env-file-selected", name: ".env.production" };
      const actions = await handleWebviewMessage(message, state);

      expect(state.activeEnvFile).toBe(".env.production");
      expect(actions).toHaveLength(0);
    });
  });

  describe("new-request", () => {
    it("creates a new request", async () => {
      const mockFs = createMockFs({ collections: [] });
      const state = createMockState({ fs: mockFs });

      const message: WebviewMessage = { type: "new-request", name: "New Request" };
      const actions = await handleWebviewMessage(message, state);

      expect(state.currentRequest).toBeDefined();
      expect(state.currentRequest?.name).toBe("New Request");
      expect(state.currentRequest?.method).toBe("GET");
      expect(state.currentRequest?.url).toBe("");
      expect(state.currentRequest?.id).toBeDefined();
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("update");

      // Verify the request was persisted in the mock fs
      const persisted = await mockFs.readRequest(state.currentRequest!.id);
      expect(persisted).not.toBeNull();
    });

    it("does nothing when no folder is set", async () => {
      const state: WebviewState = {
        folderPath: undefined,
        activeEnvFile: undefined,
        currentRequest: undefined,
        response: undefined,
        collections: [],
        historyStore: createHistoryStore(1000),
        fs: undefined,
      };
      const message: WebviewMessage = { type: "new-request", name: "New Request" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(0);
    });
  });

  describe("send-request", () => {
    it("sends a request and posts response on success", async () => {
      const state = createMockState({
        currentRequest: createMockRequest(),
      });

      const mockResponse: Response = {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        data: { success: true },
        duration: 42,
        request: { method: "GET", url: "https://api.example.com/test" },
      };

      const { sendRequest } = await import("@sentry-api/core");
      vi.mocked(sendRequest).mockResolvedValue(mockResponse);

      const message: WebviewMessage = { type: "send-request" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("response");
      expect(actions[0].response.status).toBe(200);
      // History should have been updated
      expect(state.historyStore.entries).toHaveLength(1);
    });

    it("posts error on error response", async () => {
      const state = createMockState({
        currentRequest: createMockRequest(),
      });

      const mockError = {
        error: "Network Error",
        request: { method: "GET", url: "https://nonexistent.example.com" },
        details: { duration: 100 },
      };

      const { sendRequest } = await import("@sentry-api/core");
      vi.mocked(sendRequest).mockResolvedValue(mockError);

      const message: WebviewMessage = { type: "send-request" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("error");
      expect(actions[0].message).toContain("Network Error");
    });

    it("handles missing request gracefully", async () => {
      const state: WebviewState = {
        folderPath: "/test/folder",
        activeEnvFile: undefined,
        currentRequest: undefined,
        response: undefined,
        collections: [],
        historyStore: createHistoryStore(1000),
        fs: createMockFs(),
      };
      const message: WebviewMessage = { type: "send-request" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("error");
      expect(actions[0].message).toContain("No request selected");
    });

    it("handles missing folder gracefully", async () => {
      const state: WebviewState = {
        folderPath: undefined,
        activeEnvFile: undefined,
        currentRequest: createMockRequest(),
        response: undefined,
        collections: [],
        historyStore: createHistoryStore(1000),
        fs: undefined,
      };
      const message: WebviewMessage = { type: "send-request" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("error");
      expect(actions[0].message).toContain("No request selected");
    });

    it("handles exceptions from sendRequest", async () => {
      const state = createMockState({
        currentRequest: createMockRequest(),
      });

      const { sendRequest } = await import("@sentry-api/core");
      vi.mocked(sendRequest).mockRejectedValue(new Error("Unexpected error"));

      const message: WebviewMessage = { type: "send-request" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("error");
      expect(actions[0].message).toContain("Unexpected error");
    });

    it("reads env vars from the file system when activeEnvFile is set", async () => {
      const state = createMockState({
        currentRequest: createMockRequest({ url: "https://{{HOST}}/api" }),
        activeEnvFile: ".env.test",
        fs: createMockFs({
          envFiles: [".env.test"],
          envValues: { ".env.test": { HOST: "api.example.com" } },
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
      // Verify the URL was interpolated with env vars from the file system
      expect(mockResponse.request.url).toBe("https://api.example.com/api");
    });
  });

  describe("get-history", () => {
    it("posts history entries", async () => {
      const state = createMockState();
      // Add some entries to history
      state.historyStore.entries.push(
        {
          id: "h1",
          request: { method: "GET", url: "https://example.com" },
          response: {
            status: 200,
            statusText: "OK",
            headers: {},
            data: {},
            duration: 10,
            request: { method: "GET", url: "https://example.com" },
          },
          timestamp: new Date().toISOString(),
        }
      );

      const message: WebviewMessage = { type: "get-history" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("history");
      expect(actions[0].history).toHaveLength(1);
    });
  });

  describe("get-env-files", () => {
    it("returns env files from the file system", async () => {
      const mockFs = createMockFs({
        envFiles: [".env.development", ".env.production"],
      });
      const state = createMockState({ fs: mockFs });

      const message: WebviewMessage = { type: "get-env-files" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("env-files");
      expect(actions[0].files).toEqual([".env.development", ".env.production"]);
    });

    it("returns empty array when no env files", async () => {
      const mockFs = createMockFs({ envFiles: [] });
      const state = createMockState({ fs: mockFs });

      const message: WebviewMessage = { type: "get-env-files" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("env-files");
      expect(actions[0].files).toEqual([]);
    });

    it("does nothing when no file system is set", async () => {
      const state: WebviewState = {
        folderPath: "/test/folder",
        activeEnvFile: undefined,
        currentRequest: undefined,
        response: undefined,
        collections: [],
        historyStore: createHistoryStore(1000),
        fs: undefined,
      };
      const message: WebviewMessage = { type: "get-env-files" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(0);
    });
  });

  describe("delete-request", () => {
    it("deletes the current request and updates state", async () => {
      const mockRequest = createMockRequest();
      const mockFs = createMockFs({ requests: { "req-1": mockRequest } });
      const state = createMockState({
        currentRequest: mockRequest,
        fs: mockFs,
      });

      const message: WebviewMessage = { type: "delete-request" };
      const actions = await handleWebviewMessage(message, state);

      expect(state.currentRequest).toBeUndefined();
      expect(state.response).toBeUndefined();
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("update");

      // Verify the request was actually deleted from the mock fs
      const deleted = await mockFs.readRequest("req-1");
      expect(deleted).toBeNull();
    });

    it("does nothing when no file system", async () => {
      const state: WebviewState = {
        folderPath: "/test/folder",
        activeEnvFile: undefined,
        currentRequest: createMockRequest(),
        response: undefined,
        collections: [],
        historyStore: createHistoryStore(1000),
        fs: undefined,
      };
      const message: WebviewMessage = { type: "delete-request" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(0);
    });
  });

  describe("unknown message type", () => {
    it("logs and returns no actions", async () => {
      const state = createMockState();
      const consoleSpy = vi.spyOn(console, "log");

      const message: WebviewMessage = { type: "unknown-type" };
      const actions = await handleWebviewMessage(message, state);

      expect(consoleSpy).toHaveBeenCalledWith("Unknown message type:", "unknown-type");
      expect(actions).toHaveLength(0);
      consoleSpy.mockRestore();
    });
  });

  describe("environment variable interpolation", () => {
    it("interpolates variables in URL when env vars are provided via state", async () => {
      const state = createMockState({
        currentRequest: createMockRequest({
          url: "https://{{HOST}}/api",
        }),
        activeEnvFile: ".env",
        fs: createMockFs({
          envFiles: [".env"],
          envValues: { ".env": { HOST: "api.example.com" } },
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
      await handleWebviewMessage(message, state);

      expect(mockResponse.request.url).toBe("https://api.example.com/api");
    });

    it("leaves unknown variables unchanged", async () => {
      const { interpolate } = await import("@sentry-api/core");
      const result = interpolate("https://{{UNKNOWN}}/api", {});
      expect(result).toBe("https://{{UNKNOWN}}/api");
    });
  });

  describe("view-history", () => {
    it("returns a view-history action", async () => {
      const state = createMockState();

      const message: WebviewMessage = { type: "view-history" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("view-history");
    });
  });

  describe("diff-with-history", () => {
    it("returns a diff-with-history action with current response", async () => {
      const mockResponse: Response = {
        status: 200,
        statusText: "OK",
        headers: {},
        data: { key: "value" },
        duration: 10,
        request: { method: "GET", url: "https://example.com" },
      };
      const state = createMockState({
        response: mockResponse,
      });

      const message: WebviewMessage = { type: "diff-with-history" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("diff-with-history");
      expect(actions[0].response).toEqual(mockResponse);
    });

    it("returns diff-with-history action with error response", async () => {
      const errorResponse: ErrorResponse = {
        error: "Not Found",
        request: { method: "GET", url: "https://example.com/missing" },
      };
      const state = createMockState({
        response: errorResponse,
      });

      const message: WebviewMessage = { type: "diff-with-history" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("diff-with-history");
      expect(actions[0].response).toEqual(errorResponse);
    });
  });

  describe("history integration", () => {
    it("posts history entries when get-history is requested", async () => {
      const state = createMockState();
      // Add some history entries
      state.historyStore.entries.push(
        {
          id: "h1",
          request: { method: "GET", url: "https://example.com/api" },
          response: {
            status: 200,
            statusText: "OK",
            headers: {},
            data: { users: [1, 2, 3] },
            duration: 45,
            request: { method: "GET", url: "https://example.com/api" },
          },
          timestamp: new Date().toISOString(),
        },
        {
          id: "h2",
          request: { method: "POST", url: "https://example.com/users" },
          response: {
            status: 201,
            statusText: "Created",
            headers: {},
            data: { id: 4 },
            duration: 120,
            request: { method: "POST", url: "https://example.com/users" },
          },
          timestamp: new Date().toISOString(),
        }
      );

      const message: WebviewMessage = { type: "get-history" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("history");
      expect(actions[0].history).toHaveLength(2);
      expect(actions[0].history[0].request.method).toBe("GET");
      expect(actions[0].history[1].request.method).toBe("POST");
    });

    it("returns empty history when no entries exist", async () => {
      const state = createMockState();

      const message: WebviewMessage = { type: "get-history" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("history");
      expect(actions[0].history).toHaveLength(0);
    });

    it("view-history action opens the history panel", async () => {
      const state = createMockState();

      const message: WebviewMessage = { type: "view-history" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("view-history");
    });

    it("diff-with-history includes the current response data", async () => {
      const mockResponse: Response = {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        data: { name: "Alice", email: "alice@example.com", role: "admin" },
        duration: 35,
        request: { method: "GET", url: "https://api.example.com/users/1" },
      };
      const state = createMockState({
        response: mockResponse,
      });

      const message: WebviewMessage = { type: "diff-with-history" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("diff-with-history");
      expect(actions[0].response).toBeDefined();
      expect(actions[0].response.status).toBe(200);
      expect(actions[0].response.data).toEqual({
        name: "Alice",
        email: "alice@example.com",
        role: "admin",
      });
    });

    it("diff-with-history works when no response is set", async () => {
      const state = createMockState({
        response: undefined,
      });

      const message: WebviewMessage = { type: "diff-with-history" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("diff-with-history");
      // Response should be undefined when no response is set
      expect(actions[0].response).toBeUndefined();
    });

    it("history is populated after send-request succeeds", async () => {
      const state = createMockState({
        currentRequest: createMockRequest(),
      });

      const mockResponse: Response = {
        status: 200,
        statusText: "OK",
        headers: {},
        data: { success: true },
        duration: 42,
        request: { method: "GET", url: "https://api.example.com/test" },
      };

      const { sendRequest } = await import("@sentry-api/core");
      vi.mocked(sendRequest).mockResolvedValue(mockResponse);

      const message: WebviewMessage = { type: "send-request" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("response");
      // History should have been updated with the request
      expect(state.historyStore.entries).toHaveLength(1);
      expect(state.historyStore.entries[0].request.method).toBe("GET");
      expect(state.historyStore.entries[0].request.url).toBe("https://api.example.com/test");
      expect(state.historyStore.entries[0].response.status).toBe(200);
    });

    it("history entries contain full request and response data", async () => {
      const state = createMockState({
        currentRequest: createMockRequest({
          method: "POST",
          url: "https://api.example.com/users",
          headers: { "Content-Type": "application/json" },
          body: { name: "Bob", email: "bob@example.com" },
        }),
      });

      const mockResponse: Response = {
        status: 201,
        statusText: "Created",
        headers: { "content-type": "application/json", "location": "/users/5" },
        data: { id: 5, name: "Bob", email: "bob@example.com", createdAt: "2024-01-15T10:30:00Z" },
        duration: 89,
        request: { method: "POST", url: "https://api.example.com/users" },
      };

      const coreModule = await import("@sentry-api/core");
      vi.spyOn(coreModule, "sendRequest").mockResolvedValue(mockResponse);

      const message: WebviewMessage = { type: "send-request" };
      await handleWebviewMessage(message, state);

      const historyEntry = state.historyStore.entries[0];
      expect(historyEntry).toBeDefined();
      expect(historyEntry.request.method).toBe("POST");
      expect(historyEntry.request.url).toBe("https://api.example.com/users");
      expect(historyEntry.response.status).toBe(201);
      expect(historyEntry.response.duration).toBe(89);
      expect(historyEntry.timestamp).toBeDefined();
    });

    it("multiple requests create multiple history entries", async () => {
      const state = createMockState({
        currentRequest: createMockRequest({ id: "req-1" }),
      });

      let callCount = 0;
      const responses: Response[] = [
        {
          status: 200,
          statusText: "OK",
          headers: {},
          data: { page: 1 },
          duration: 30,
          request: { method: "GET", url: "https://api.example.com/data" },
        },
        {
          status: 200,
          statusText: "OK",
          headers: {},
          data: { page: 2 },
          duration: 25,
          request: { method: "GET", url: "https://api.example.com/data" },
        },
      ];

      const coreModule = await import("@sentry-api/core");
      vi.spyOn(coreModule, "sendRequest").mockImplementation(async () => {
        const resp = responses[callCount++];
        return resp;
      });

      await handleWebviewMessage({ type: "send-request" }, state);
      await handleWebviewMessage({ type: "send-request" }, state);

      expect(state.historyStore.entries).toHaveLength(2);
      expect(state.historyStore.entries[0].response.data).toEqual({ page: 1 });
      expect(state.historyStore.entries[1].response.data).toEqual({ page: 2 });
    });

    it("history count is accessible via state", async () => {
      const state = createMockState();
      state.historyStore.entries.push(
        {
          id: "h1",
          request: { method: "GET", url: "https://example.com" },
          response: {
            status: 200,
            statusText: "OK",
            headers: {},
            data: {},
            duration: 10,
            request: { method: "GET", url: "https://example.com" },
          },
          timestamp: new Date().toISOString(),
        }
      );

      expect(state.historyStore.entries.length).toBe(1);

      const message: WebviewMessage = { type: "get-history" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions[0].history.length).toBe(1);
    });
  });

  describe("diff integration", () => {
    it("diff-with-history action contains response for diff panel", async () => {
      const mockResponse: Response = {
        status: 200,
        statusText: "OK",
        headers: {},
        data: { users: [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }] },
        duration: 55,
        request: { method: "GET", url: "https://api.example.com/users" },
      };
      const state = createMockState({
        response: mockResponse,
      });

      const message: WebviewMessage = { type: "diff-with-history" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      const diffAction = actions[0];
      expect(diffAction.type).toBe("diff-with-history");
      expect(diffAction.response).toBeDefined();
      expect(diffAction.response.status).toBe(200);
      expect(diffAction.response.data).toEqual({
        users: [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }],
      });
    });

    it("diff-with-history preserves response metadata", async () => {
      const mockResponse: Response = {
        status: 200,
        statusText: "OK",
        headers: {
          "content-type": "application/json",
          "x-rate-limit-remaining": "99",
          "x-request-id": "abc123",
        },
        data: { message: "success" },
        duration: 42,
        request: { method: "GET", url: "https://api.example.com/status" },
      };
      const state = createMockState({
        response: mockResponse,
      });

      const message: WebviewMessage = { type: "diff-with-history" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions[0].response.headers).toEqual({
        "content-type": "application/json",
        "x-rate-limit-remaining": "99",
        "x-request-id": "abc123",
      });
      expect(actions[0].response.duration).toBe(42);
    });

    it("diff-with-history works with nested response data", async () => {
      const mockResponse: Response = {
        status: 200,
        statusText: "OK",
        headers: {},
        data: {
          meta: { total: 100, page: 1, perPage: 10 },
          data: [
            { id: 1, attributes: { name: "Item 1", price: 9.99 } },
            { id: 2, attributes: { name: "Item 2", price: 19.99 } },
          ],
          links: { self: "/api/items?page=1", next: "/api/items?page=2" },
        },
        duration: 67,
        request: { method: "GET", url: "https://api.example.com/items" },
      };
      const state = createMockState({
        response: mockResponse,
      });

      const message: WebviewMessage = { type: "diff-with-history" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions[0].response.data).toEqual({
        meta: { total: 100, page: 1, perPage: 10 },
        data: [
          { id: 1, attributes: { name: "Item 1", price: 9.99 } },
          { id: 2, attributes: { name: "Item 2", price: 19.99 } },
        ],
        links: { self: "/api/items?page=1", next: "/api/items?page=2" },
      });
    });

    it("diff-with-history action is created even with empty response data", async () => {
      const mockResponse: Response = {
        status: 204,
        statusText: "No Content",
        headers: {},
        data: null,
        duration: 15,
        request: { method: "DELETE", url: "https://api.example.com/users/5" },
      };
      const state = createMockState({
        response: mockResponse,
      });

      const message: WebviewMessage = { type: "diff-with-history" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("diff-with-history");
      expect(actions[0].response.status).toBe(204);
      expect(actions[0].response.data).toBeNull();
    });
  });

  describe("replay from history", () => {
    it("history entries can be retrieved for replay", async () => {
      const state = createMockState();
      state.historyStore.entries.push(
        {
          id: "h1",
          request: {
            method: "POST",
            url: "https://api.example.com/users",
            headers: { "Content-Type": "application/json" },
            body: { name: "Test User" },
          },
          response: {
            status: 201,
            statusText: "Created",
            headers: {},
            data: { id: 10 },
            duration: 55,
            request: {
              method: "POST",
              url: "https://api.example.com/users",
            },
          },
          timestamp: new Date().toISOString(),
        }
      );

      const message: WebviewMessage = { type: "get-history" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions[0].history[0].request.method).toBe("POST");
      expect(actions[0].history[0].request.url).toBe("https://api.example.com/users");
      expect(actions[0].history[0].request.body).toEqual({ name: "Test User" });
    });

    it("history entries preserve original request headers", async () => {
      const state = createMockState();
      state.historyStore.entries.push(
        {
          id: "h1",
          request: {
            method: "PUT",
            url: "https://api.example.com/users/1",
            headers: {
              "Authorization": "Bearer token123",
              "Content-Type": "application/json",
              "X-Custom-Header": "custom-value",
            },
            body: { name: "Updated Name" },
          },
          response: {
            status: 200,
            statusText: "OK",
            headers: {},
            data: { id: 1, name: "Updated Name" },
            duration: 40,
            request: {
              method: "PUT",
              url: "https://api.example.com/users/1",
            },
          },
          timestamp: new Date().toISOString(),
        }
      );

      const message: WebviewMessage = { type: "get-history" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions[0].history[0].request.headers).toEqual({
        "Authorization": "Bearer token123",
        "Content-Type": "application/json",
        "X-Custom-Header": "custom-value",
      });
    });

    it("history entries preserve query parameters", async () => {
      const state = createMockState();
      state.historyStore.entries.push(
        {
          id: "h1",
          request: {
            method: "GET",
            url: "https://api.example.com/search",
            query: { q: "test", page: "1", limit: "10" },
          },
          response: {
            status: 200,
            statusText: "OK",
            headers: {},
            data: { results: [], total: 0 },
            duration: 30,
            request: {
              method: "GET",
              url: "https://api.example.com/search",
            },
          },
          timestamp: new Date().toISOString(),
        }
      );

      const message: WebviewMessage = { type: "get-history" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions[0].history[0].request.query).toEqual({
        q: "test",
        page: "1",
        limit: "10",
      });
    });
  });

  describe("unknown message type", () => {
    it("logs and returns no actions", async () => {
      const state = createMockState();
      const consoleSpy = vi.spyOn(console, "log");

      const message: WebviewMessage = { type: "unknown-type" };
      const actions = await handleWebviewMessage(message, state);

      expect(consoleSpy).toHaveBeenCalledWith("Unknown message type:", "unknown-type");
      expect(actions).toHaveLength(0);
      consoleSpy.mockRestore();
    });
  });
});
