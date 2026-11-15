import type { Response, RequestOptions } from "./types";

export interface HistoryEntry {
  id: string;
  request: RequestOptions;
  response: Response;
  timestamp: string; // ISO timestamp
}

export interface HistoryStore {
  entries: HistoryEntry[];
  maxEntries: number;
}

/**
 * Creates a new history store with a default max of 1000 entries.
 */
export function createHistoryStore(maxEntries: number = 1000): HistoryStore {
  return {
    entries: [],
    maxEntries,
  };
}

/**
 * Adds a request/response pair to the history.
 */
export function addToHistory(
  store: HistoryStore,
  request: RequestOptions,
  response: Response
): HistoryEntry {
  const entry: HistoryEntry = {
    id: generateId(),
    request,
    response,
    timestamp: new Date().toISOString(),
  };

  store.entries.unshift(entry);

  // Trim to max entries
  if (store.entries.length > store.maxEntries) {
    store.entries = store.entries.slice(0, store.maxEntries);
  }

  return entry;
}

/**
 * Retrieves a history entry by ID.
 */
export function getHistoryEntry(
  store: HistoryStore,
  id: string
): HistoryEntry | undefined {
  return store.entries.find((entry) => entry.id === id);
}

/**
 * Removes a history entry by ID.
 */
export function removeHistoryEntry(
  store: HistoryStore,
  id: string
): boolean {
  const index = store.entries.findIndex((entry) => entry.id === id);
  if (index === -1) {
    return false;
  }
  store.entries.splice(index, 1);
  return true;
}

/**
 * Clears all history entries.
 */
export function clearHistory(store: HistoryStore): void {
  store.entries = [];
}

/**
 * Searches history entries by keyword in URL, method, or status.
 */
export function searchHistory(
  store: HistoryStore,
  keyword: string
): HistoryEntry[] {
  const lowerKeyword = keyword.toLowerCase();
  return store.entries.filter(
    (entry) =>
      entry.request.url.toLowerCase().includes(lowerKeyword) ||
      entry.request.method.toLowerCase().includes(lowerKeyword) ||
      entry.response.status.toString().includes(lowerKeyword)
  );
}

/**
 * Gets history entries filtered by HTTP method.
 */
export function filterByMethod(
  store: HistoryStore,
  method: string
): HistoryEntry[] {
  return store.entries.filter(
    (entry) => entry.request.method.toUpperCase() === method.toUpperCase()
  );
}

/**
 * Gets history entries filtered by status code range.
 */
export function filterByStatus(
  store: HistoryStore,
  status: number
): HistoryEntry[] {
  return store.entries.filter(
    (entry) => entry.response.status === status
  );
}

/**
 * Replays a history entry by returning its request.
 */
export function replayEntry(
  store: HistoryStore,
  id: string
): RequestOptions | undefined {
  const entry = getHistoryEntry(store, id);
  if (!entry) {
    return undefined;
  }
  return { ...entry.request };
}

/**
 * Serializes the history store to JSON.
 */
export function serializeHistory(store: HistoryStore): string {
  return JSON.stringify(store, null, 2);
}

/**
 * Deserializes a JSON string into a HistoryStore.
 */
export function deserializeHistory(json: string): HistoryStore {
  const parsed = JSON.parse(json) as HistoryStore;
  return {
    entries: parsed.entries || [],
    maxEntries: parsed.maxEntries || 1000,
  };
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
