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
  options: RequestOptions,
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
export async function loadCollections(
  basePath: string,
): Promise<LoadedCollection[]> {
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

/** Lists `.env` files in a folder (non-recursive). */
export async function listEnvFiles(basePath: string): Promise<string[]> {
  return invoke<string[]>("list_env_files", { basePath });
}

/** Reads the content of a `.env` file. */
export async function readEnvFile(
  basePath: string,
  filename: string,
): Promise<string> {
  return invoke<string>("read_env_file", { basePath, filename });
}

/** Starts watching a folder for file changes. Emits `collection-changed` events. */
export function watchCollections(
  basePath: string,
  onEvent: (kind: string, changedPaths: string[]) => void,
): () => void {
  const handler = (e: Event) => {
    const customEvent = e as CustomEvent<[string, string[]]>;
    onEvent(customEvent.detail[0], customEvent.detail[1]);
  };
  window.addEventListener("collection-changed", handler as EventListener);
  invoke("watch_collections", { basePath }).catch(() => {
    // Watcher may fail if the folder doesn't exist yet; that's fine.
  });
  return () => {
    window.removeEventListener("collection-changed", handler as EventListener);
  };
}

/** Exports a request as a cURL command string. */
export async function exportCurl(options: RequestOptions): Promise<string> {
  return invoke<string>("export_curl", {
    method: options.method,
    url: options.url,
    headers: options.headers,
    query: options.query,
    body: options.body,
  });
}

export { errorMessage };
