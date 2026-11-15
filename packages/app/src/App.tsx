import { useState, useCallback, useEffect, useRef } from "react";
import Sidebar from "./components/Sidebar";
import RequestEditor from "./components/RequestEditor";
import ResponseViewer from "./components/ResponseViewer";
import EnvironmentSwitcher from "./components/EnvironmentSwitcher";
import ToastContainer from "./components/Toast";
import type { HistoryEntry, RequestFile, RequestOptions, Response } from "@sentry-api/core/browser";
import {
  addToHistory,
  clearHistory,
  createHistoryStore,
  getHistoryEntry,
  isErrorResponse,
  replayEntry,
} from "@sentry-api/core/browser";
import { open } from "@tauri-apps/plugin-dialog";
import {
  errorMessage,
  loadCollections,
  loadHistory,
  saveHistory,
  sendHttpRequest,
  type LoadedCollection,
  watchCollections,
} from "./lib/api";

interface Toast {
  id: string;
  message: string;
  type: "info" | "error" | "success" | "warning";
}

function toRequestOptions(request: RequestFile): RequestOptions {
  return {
    method: request.method,
    url: request.url,
    headers: request.headers,
    query: request.query,
    body: request.body,
  };
}

let toastIdCounter = 0;

function addToast(
  setToasts: React.Dispatch<React.SetStateAction<Toast[]>>,
  message: string,
  type: Toast["type"] = "info"
) {
  const id = `toast-${++toastIdCounter}-${Date.now()}`;
  setToasts((prev) => [...prev, { id, message, type }]);
  // Auto-dismiss after 4 seconds
  setTimeout(() => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, 4000);
}

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [collections, setCollections] = useState<LoadedCollection[]>([]);
  const [basePath, setBasePath] = useState<string | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [editorRequest, setEditorRequest] = useState<RequestOptions | undefined>(undefined);
  const [response, setResponse] = useState<Response | null>(null);
  const [previousResponse, setPreviousResponse] = useState<Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Environment state
  const [activeEnv, setActiveEnv] = useState<string | null>(null);
  const [envValues, setEnvValues] = useState<Record<string, string>>({});

  // Toast notifications
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // The core history store is mutated in place; `history` mirrors its entries for rendering.
  const historyStoreRef = useRef(createHistoryStore());

  // File watching cleanup
  const watchCleanupRef = useRef<(() => void) | null>(null);

  const persistHistory = useCallback(() => {
    saveHistory(historyStoreRef.current).catch((err) => {
      addToast(setToasts, `Could not save history: ${errorMessage(err)}`, "error");
    });
  }, []);

  // Load persisted history once on startup.
  useEffect(() => {
    let cancelled = false;
    loadHistory()
      .then((stored) => {
        if (cancelled) return;
        const store = historyStoreRef.current;
        // Keep anything sent before loading finished, newest first.
        const known = new Set(store.entries.map((e) => e.id));
        store.entries = [
          ...store.entries,
          ...stored.entries.filter((e) => !known.has(e.id)),
        ].slice(0, store.maxEntries);
        setHistory([...store.entries]);
      })
      .catch((err) => {
        if (!cancelled) addToast(setToasts, `Could not load history: ${errorMessage(err)}`, "warning");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Load collections from a folder on disk via the Tauri backend. */
  const openCollections = useCallback(async (folderPath: string) => {
    try {
      const loaded = await loadCollections(folderPath);
      setCollections(loaded);
      setBasePath(folderPath);
      setSelectedCollectionId(loaded.length === 1 ? loaded[0].id : null);
      setSelectedRequestId(null);
      if (loaded.length === 0) {
        addToast(setToasts, "No collections found in this folder.", "warning");
      } else {
        addToast(setToasts, `Loaded ${loaded.length} collection(s)`, "success");
      }

      // Start watching for external file changes
      if (watchCleanupRef.current) {
        watchCleanupRef.current();
      }
      watchCleanupRef.current = watchCollections(folderPath, (kind, changedPaths) => {
        addToast(setToasts, `File changed: ${changedPaths.join(", ")} (${kind})`, "info");
        // Reload collections to pick up changes
        loadCollections(folderPath)
          .then((updated) => {
            setCollections(updated);
          })
          .catch(() => {});
      });
    } catch (err) {
      addToast(setToasts, `Could not open folder: ${errorMessage(err)}`, "error");
    }
  }, []);

  /** Open a folder picker and load collections from the chosen path. */
  const handleOpenFolder = useCallback(async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === "string") {
        await openCollections(selected);
      }
    } catch (err) {
      addToast(setToasts, `Could not open folder: ${errorMessage(err)}`, "error");
    }
  }, [openCollections]);

  /** Send a request, show the response and record it in history. */
  const handleSend = useCallback(
    async (request: RequestOptions) => {
      setLoading(true);
      setResponse(null);
      setSelectedHistoryId(null);

      try {
        const result = await sendHttpRequest(request);
        if (isErrorResponse(result)) {
          addToast(setToasts, result.error, "error");
          return;
        }
        // Store previous response for diffing
        setPreviousResponse(response);
        setResponse(result);
        const entry = addToHistory(historyStoreRef.current, request, result);
        setHistory([...historyStoreRef.current.entries]);
        setSelectedHistoryId(entry.id);
        persistHistory();
        addToast(setToasts, `Response: ${result.status} ${result.statusText} (${result.duration}ms)`, "success");
      } catch (err) {
        addToast(setToasts, errorMessage(err), "error");
      } finally {
        setLoading(false);
      }
    },
    [persistHistory, response, setToasts]
  );

  /** Select a request from a collection and load it into the editor. */
  const handleSelectRequest = useCallback(
    (collectionId: string, requestId: string) => {
      const request = collections
        .find((c) => c.id === collectionId)
        ?.requests.find((r) => r.id === requestId);
      if (!request) return;
      setSelectedRequestId(requestId);
      setSelectedHistoryId(null);
      setEditorRequest(toRequestOptions(request));
      setResponse(null);
      setPreviousResponse(null);
    },
    [collections]
  );

  /** Replay a history entry: load its request and show its recorded response. */
  const handleSelectHistory = useCallback((id: string) => {
    const store = historyStoreRef.current;
    const request = replayEntry(store, id);
    const entry = getHistoryEntry(store, id);
    if (!request || !entry) return;
    setSelectedHistoryId(id);
    setSelectedRequestId(null);
    setEditorRequest(request);
    setResponse(entry.response);
    setPreviousResponse(null);
  }, []);

  const handleClearHistory = useCallback(() => {
    clearHistory(historyStoreRef.current);
    setHistory([]);
    setSelectedHistoryId(null);
    persistHistory();
    addToast(setToasts, "History cleared", "info");
  }, [persistHistory, setToasts]);

  const handleEnvSelect = useCallback((name: string, values: Record<string, string>) => {
    setActiveEnv(name || null);
    setEnvValues(values);
    if (name) {
      addToast(setToasts, `Environment "${name}" loaded (${Object.keys(values).length} variables)`, "info");
    }
  }, [setToasts]);

  // Cleanup file watcher on unmount
  useEffect(() => {
    return () => {
      if (watchCleanupRef.current) {
        watchCleanupRef.current();
      }
    };
  }, []);

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="h-screen w-screen flex flex-col bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        {/* Top bar */}
        <header className="h-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-indigo-600 dark:text-indigo-400">Sentry API</span>
            <span className="text-xs text-gray-400">v0.1.0</span>
          </div>
          <div className="flex items-center gap-3">
            <EnvironmentSwitcher
              basePath={basePath}
              activeEnv={activeEnv}
              envValues={envValues}
              onEnvSelect={handleEnvSelect}
            />
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition"
              title="Toggle dark mode"
            >
              {darkMode ? "☀️ Light" : "🌙 Dark"}
            </button>
          </div>
        </header>

        {/* Main layout */}
        <div className="flex flex-1 overflow-hidden">
          <Sidebar
            collections={collections}
            selectedCollectionId={selectedCollectionId}
            selectedRequestId={selectedRequestId}
            onSelectCollection={setSelectedCollectionId}
            onSelectRequest={handleSelectRequest}
            onOpenFolder={handleOpenFolder}
            history={history}
            selectedHistoryId={selectedHistoryId}
            onSelectHistory={handleSelectHistory}
            onClearHistory={handleClearHistory}
          />

          <RequestEditor
            selectedRequest={editorRequest}
            onSend={handleSend}
            loading={loading}
          />

          <ResponseViewer
            response={response}
            loading={loading}
            error={null}
            previousResponse={previousResponse}
          />
        </div>

        {/* Bottom bar */}
        <footer className="h-6 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex items-center gap-3 px-3 text-xs text-gray-500 dark:text-gray-400 shrink-0">
          <span>
            {collections.length} collections · {history.length} history entries
          </span>
          {basePath && <span className="truncate font-mono" title={basePath}>{basePath}</span>}
          <span className="ml-auto text-gray-400 dark:text-gray-500">
            Ctrl+Enter to send
          </span>
        </footer>

        {/* Toast notifications */}
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    </div>
  );
}
