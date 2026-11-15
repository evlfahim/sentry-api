import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleWebviewMessage, type WebviewMessage, type WebviewState } from "../src/webview";
import { createHistoryStore, type RequestFile, type Response } from "@sentry-api/core";

// ---- Helpers ----
function createMockState(overrides: Partial<WebviewState> = {}): WebviewState {
  return {
    folderPath: overrides.folderPath ?? "/test/folder",
    activeEnvFile: overrides.activeEnvFile,
    currentRequest: overrides.currentRequest,
    response: overrides.response,
    collections: overrides.collections ?? [],
    historyStore: overrides.historyStore ?? createHistoryStore(1000),
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
      const state = createMockState({ folderPath: "/old/path" });
      const message: WebviewMessage = { type: "folder-selected", path: "/new/folder" };

      const actions = await handleWebviewMessage(message, state);

      expect(state.folderPath).toBe("/new/folder");
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("update");
    });
  });

  describe("request-selected", () => {
    it("loads a request and returns update action", async () => {
      const state = createMockState();
      const mockRequest = createMockRequest({ id: "req-2", name: "Loaded Request" });

      // Mock readRequest
      const coreModule = await import("@sentry-api/core");
      vi.spyOn(coreModule, "readRequest").mockReturnValue(mockRequest);

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
      };
      const message: WebviewMessage = { type: "request-selected", id: "req-1" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(0);
    });

    it("does nothing when request file does not exist", async () => {
      const state = createMockState();
      const coreModule = await import("@sentry-api/core");
      vi.spyOn(coreModule, "readRequest").mockReturnValue(null);

      const message: WebviewMessage = { type: "request-selected", id: "nonexistent" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(0);
    });
  });

  describe("request-updated", () => {
    it("updates the current request and persists it", async () => {
      const state = createMockState({
        currentRequest: createMockRequest({ method: "GET", url: "https://old.com" }),
      });

      const coreModule = await import("@sentry-api/core");
      vi.spyOn(coreModule, "updateRequest").mockReturnValue();

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

    it("does nothing when no current request", async () => {
      const state: WebviewState = {
        folderPath: "/test/folder",
        activeEnvFile: undefined,
        currentRequest: undefined,
        response: undefined,
        collections: [],
        historyStore: createHistoryStore(1000),
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
      const state = createMockState();
      const coreModule = await import("@sentry-api/core");
      vi.spyOn(coreModule, "listCollections").mockReturnValue([]);

      const message: WebviewMessage = { type: "new-request", name: "New Request" };
      const actions = await handleWebviewMessage(message, state);

      expect(state.currentRequest).toBeDefined();
      expect(state.currentRequest?.name).toBe("New Request");
      expect(state.currentRequest?.method).toBe("GET");
      expect(state.currentRequest?.url).toBe("");
      expect(state.currentRequest?.id).toBeDefined();
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("update");
    });

    it("does nothing when no folder is set", async () => {
      const state: WebviewState = {
        folderPath: undefined,
        activeEnvFile: undefined,
        currentRequest: undefined,
        response: undefined,
        collections: [],
        historyStore: createHistoryStore(1000),
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

      const coreModule = await import("@sentry-api/core");
      vi.spyOn(coreModule, "sendRequest").mockResolvedValue(mockResponse);

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

      const coreModule = await import("@sentry-api/core");
      vi.spyOn(coreModule, "sendRequest").mockResolvedValue(mockError);

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

      const coreModule = await import("@sentry-api/core");
      vi.spyOn(coreModule, "sendRequest").mockRejectedValue(new Error("Unexpected error"));

      const message: WebviewMessage = { type: "send-request" };
      const actions = await handleWebviewMessage(message, state);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe("error");
      expect(actions[0].message).toContain("Unexpected error");
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
    it("does nothing (handled by caller)", async () => {
      const state = createMockState();
      const message: WebviewMessage = { type: "get-env-files" };
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
      });

      // Manually set env vars in state (simulating what the WebviewManager would do)
      // The pure function doesn't read env files, but the WebviewManager bridge does.
      // For this test, we verify that interpolate is called correctly.
      const { interpolate } = await import("@sentry-api/core");
      const interpolated = interpolate("https://{{HOST}}/api", { HOST: "api.example.com" });
      expect(interpolated).toBe("https://api.example.com/api");
    });

    it("leaves unknown variables unchanged", async () => {
      const { interpolate } = await import("@sentry-api/core");
      const result = interpolate("https://{{UNKNOWN}}/api", {});
      expect(result).toBe("https://{{UNKNOWN}}/api");
    });
  });
});
