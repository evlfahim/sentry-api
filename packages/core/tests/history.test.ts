import { describe, it, expect } from "vitest";
import {
  createHistoryStore,
  addToHistory,
  getHistoryEntry,
  removeHistoryEntry,
  clearHistory,
  searchHistory,
  filterByMethod,
  filterByStatus,
  replayEntry,
  serializeHistory,
  deserializeHistory,
} from "../src/history";
import { Response, RequestOptions } from "../src/http-client";

describe("history", () => {
  it("should create a history store with default max entries", () => {
    const store = createHistoryStore();
    expect(store.entries).toEqual([]);
    expect(store.maxEntries).toBe(1000);
  });

  it("should create a history store with custom max entries", () => {
    const store = createHistoryStore(100);
    expect(store.maxEntries).toBe(100);
  });

  it("should add an entry to the history", () => {
    const store = createHistoryStore();
    const request: RequestOptions = {
      method: "GET",
      url: "https://api.example.com/users",
    };
    const response: Response = {
      status: 200,
      statusText: "OK",
      headers: { "content-type": "application/json" },
      data: { users: [] },
      duration: 150,
      request,
    };

    const entry = addToHistory(store, request, response);
    expect(entry.id).toBeDefined();
    expect(entry.request).toEqual(request);
    expect(entry.response.status).toBe(200);
    expect(entry.timestamp).toBeDefined();
    expect(store.entries.length).toBe(1);
  });

  it("should add entries in reverse chronological order", () => {
    const store = createHistoryStore();

    addToHistory(
      store,
      { method: "GET", url: "https://api.example.com/1" },
      {
        status: 200,
        statusText: "OK",
        headers: {},
        data: {},
        duration: 100,
        request: { method: "GET", url: "https://api.example.com/1" },
      },
    );

    addToHistory(
      store,
      { method: "POST", url: "https://api.example.com/2" },
      {
        status: 201,
        statusText: "Created",
        headers: {},
        data: {},
        duration: 200,
        request: { method: "POST", url: "https://api.example.com/2" },
      },
    );

    expect(store.entries[0].request.url).toBe("https://api.example.com/2");
    expect(store.entries[1].request.url).toBe("https://api.example.com/1");
  });

  it("should trim entries when exceeding max", () => {
    const store = createHistoryStore(3);

    for (let i = 0; i < 5; i++) {
      addToHistory(
        store,
        { method: "GET", url: `https://api.example.com/${i}` },
        {
          status: 200,
          statusText: "OK",
          headers: {},
          data: {},
          duration: 100,
          request: { method: "GET", url: `https://api.example.com/${i}` },
        },
      );
    }

    expect(store.entries.length).toBe(3);
    // The last 3 entries should remain (indices 2, 3, 4)
    expect(store.entries[0].request.url).toBe("https://api.example.com/4");
    expect(store.entries[1].request.url).toBe("https://api.example.com/3");
    expect(store.entries[2].request.url).toBe("https://api.example.com/2");
  });

  it("should get a history entry by ID", () => {
    const store = createHistoryStore();
    const entry = addToHistory(
      store,
      { method: "GET", url: "https://api.example.com/users" },
      {
        status: 200,
        statusText: "OK",
        headers: {},
        data: {},
        duration: 100,
        request: { method: "GET", url: "https://api.example.com/users" },
      },
    );

    const found = getHistoryEntry(store, entry.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(entry.id);
  });

  it("should return undefined for non-existent entry", () => {
    const store = createHistoryStore();
    const found = getHistoryEntry(store, "non-existent");
    expect(found).toBeUndefined();
  });

  it("should remove a history entry", () => {
    const store = createHistoryStore();
    const entry = addToHistory(
      store,
      { method: "GET", url: "https://api.example.com/users" },
      {
        status: 200,
        statusText: "OK",
        headers: {},
        data: {},
        duration: 100,
        request: { method: "GET", url: "https://api.example.com/users" },
      },
    );

    const removed = removeHistoryEntry(store, entry.id);
    expect(removed).toBe(true);
    expect(store.entries.length).toBe(0);
  });

  it("should return false when removing non-existent entry", () => {
    const store = createHistoryStore();
    const removed = removeHistoryEntry(store, "non-existent");
    expect(removed).toBe(false);
  });

  it("should clear all history", () => {
    const store = createHistoryStore();
    addToHistory(
      store,
      { method: "GET", url: "https://api.example.com/1" },
      {
        status: 200,
        statusText: "OK",
        headers: {},
        data: {},
        duration: 100,
        request: { method: "GET", url: "https://api.example.com/1" },
      },
    );
    addToHistory(
      store,
      { method: "POST", url: "https://api.example.com/2" },
      {
        status: 201,
        statusText: "Created",
        headers: {},
        data: {},
        duration: 200,
        request: { method: "POST", url: "https://api.example.com/2" },
      },
    );

    clearHistory(store);
    expect(store.entries.length).toBe(0);
  });

  it("should search history by keyword", () => {
    const store = createHistoryStore();
    addToHistory(
      store,
      { method: "GET", url: "https://api.example.com/users" },
      {
        status: 200,
        statusText: "OK",
        headers: {},
        data: {},
        duration: 100,
        request: { method: "GET", url: "https://api.example.com/users" },
      },
    );
    addToHistory(
      store,
      { method: "POST", url: "https://api.example.com/posts" },
      {
        status: 201,
        statusText: "Created",
        headers: {},
        data: {},
        duration: 200,
        request: { method: "POST", url: "https://api.example.com/posts" },
      },
    );

    const results = searchHistory(store, "users");
    expect(results.length).toBe(1);
    expect(results[0].request.url).toBe("https://api.example.com/users");
  });

  it("should search history by method", () => {
    const store = createHistoryStore();
    addToHistory(
      store,
      { method: "GET", url: "https://api.example.com/users" },
      {
        status: 200,
        statusText: "OK",
        headers: {},
        data: {},
        duration: 100,
        request: { method: "GET", url: "https://api.example.com/users" },
      },
    );
    addToHistory(
      store,
      { method: "POST", url: "https://api.example.com/posts" },
      {
        status: 201,
        statusText: "Created",
        headers: {},
        data: {},
        duration: 200,
        request: { method: "POST", url: "https://api.example.com/posts" },
      },
    );

    const results = searchHistory(store, "POST");
    expect(results.length).toBe(1);
    expect(results[0].request.method).toBe("POST");
  });

  it("should filter by HTTP method", () => {
    const store = createHistoryStore();
    addToHistory(
      store,
      { method: "GET", url: "https://api.example.com/users" },
      {
        status: 200,
        statusText: "OK",
        headers: {},
        data: {},
        duration: 100,
        request: { method: "GET", url: "https://api.example.com/users" },
      },
    );
    addToHistory(
      store,
      { method: "POST", url: "https://api.example.com/posts" },
      {
        status: 201,
        statusText: "Created",
        headers: {},
        data: {},
        duration: 200,
        request: { method: "POST", url: "https://api.example.com/posts" },
      },
    );

    const results = filterByMethod(store, "GET");
    expect(results.length).toBe(1);
    expect(results[0].request.method).toBe("GET");
  });

  it("should filter by status code", () => {
    const store = createHistoryStore();
    addToHistory(
      store,
      { method: "GET", url: "https://api.example.com/users" },
      {
        status: 200,
        statusText: "OK",
        headers: {},
        data: {},
        duration: 100,
        request: { method: "GET", url: "https://api.example.com/users" },
      },
    );
    addToHistory(
      store,
      { method: "POST", url: "https://api.example.com/posts" },
      {
        status: 201,
        statusText: "Created",
        headers: {},
        data: {},
        duration: 200,
        request: { method: "POST", url: "https://api.example.com/posts" },
      },
    );

    const results = filterByStatus(store, 201);
    expect(results.length).toBe(1);
    expect(results[0].response.status).toBe(201);
  });

  it("should replay a history entry", () => {
    const store = createHistoryStore();
    const request: RequestOptions = {
      method: "GET",
      url: "https://api.example.com/users",
      headers: { Authorization: "Bearer token" },
    };
    addToHistory(store, request, {
      status: 200,
      statusText: "OK",
      headers: {},
      data: {},
      duration: 100,
      request,
    });

    const replayed = replayEntry(store, store.entries[0].id);
    expect(replayed).toEqual(request);
  });

  it("should return undefined for replaying non-existent entry", () => {
    const store = createHistoryStore();
    const replayed = replayEntry(store, "non-existent");
    expect(replayed).toBeUndefined();
  });

  it("should serialize and deserialize history", () => {
    const store = createHistoryStore();
    addToHistory(
      store,
      { method: "GET", url: "https://api.example.com/users" },
      {
        status: 200,
        statusText: "OK",
        headers: {},
        data: {},
        duration: 100,
        request: { method: "GET", url: "https://api.example.com/users" },
      },
    );

    const serialized = serializeHistory(store);
    const deserialized = deserializeHistory(serialized);

    expect(deserialized.entries.length).toBe(1);
    expect(deserialized.maxEntries).toBe(1000);
    expect(deserialized.entries[0].request.url).toBe(
      "https://api.example.com/users",
    );
  });

  it("should handle empty history serialization", () => {
    const store = createHistoryStore();
    const serialized = serializeHistory(store);
    const deserialized = deserializeHistory(serialized);

    expect(deserialized.entries.length).toBe(0);
  });
});
