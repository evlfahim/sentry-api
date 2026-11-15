/**
 * Bridge between the UI and the Tauri backend. The backend only provides
 * transport and file access; all request/response shapes come from the
 * core library so the same UI logic can later run inside a VS Code webview.
 */
import { invoke } from "@tauri-apps/api/core";
import {
  createHistoryStore,
  deserializeHistory,
  getHeader,
  parseResponseBody,
  serializeHistory,
} from "@sentry-api/core/browser";
import type {
  Collection,
  ErrorResponse,
  HistoryStore,
  RequestOptions,
  Response,
} from "@sentry-api/core/browser";

/** Raw response returned by the `send_http_request` command. */
interface RawHttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
}

/** A collection as read from disk, plus the folder it lives in. */
export type LoadedCollection = Collection & { path: string };

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Sends a request through the Rust backend and returns a core `Response`,
 * or an `ErrorResponse` when the request could not be completed.
 */
export async function sendHttpRequest(
  options: RequestOptions
): Promise<Response | ErrorResponse> {
  const startedAt = Date.now();
  try {
    const raw = await invoke<RawHttpResponse>("send_http_request", {
      request: {
        method: options.method,
        url: options.url,
        headers: options.headers ?? {},
        query: options.query ?? {},
        body: options.body === undefined ? null : options.body,
        timeoutMs: options.timeout ?? null,
      },
    });
    return {
      status: raw.status,
      statusText: raw.statusText,
      headers: raw.headers,
      data: parseResponseBody(raw.body, getHeader(raw.headers, "content-type")),
      duration: raw.durationMs,
      request: options,
    };
  } catch (err) {
    return {
      error: errorMessage(err),
      request: options,
      details: { duration: Date.now() - startedAt },
    };
  }
}

/** Reads all collections in a folder (one-file-per-request layout). */
export async function loadCollections(basePath: string): Promise<LoadedCollection[]> {
  return invoke<LoadedCollection[]>("list_collections", { basePath });
}

/** Loads the persisted history store, or an empty one if none exists. */
export async function loadHistory(maxEntries?: number): Promise<HistoryStore> {
  const contents = await invoke<string | null>("load_history");
  if (!contents) {
    return createHistoryStore(maxEntries);
  }
  try {
    const store = deserializeHistory(contents);
    if (maxEntries !== undefined) {
      store.maxEntries = maxEntries;
      store.entries = store.entries.slice(0, maxEntries);
    }
    return store;
  } catch {
    // Corrupted history file: start fresh rather than failing the app.
    return createHistoryStore(maxEntries);
  }
}

/** Persists the history store to the app data directory. */
export async function saveHistory(store: HistoryStore): Promise<void> {
  await invoke("save_history", { contents: serializeHistory(store) });
}

export { errorMessage };
