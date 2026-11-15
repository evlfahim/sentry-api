import { useState, useCallback, useRef } from "react";
import Sidebar from "./components/Sidebar";
import RequestEditor from "./components/RequestEditor";
import ResponseViewer from "./components/ResponseViewer";
import type { RequestFile, HistoryEntry, Response, ErrorResponse } from "@sentry-api/core";
import { sendRequest, createHistoryStore, addToHistory, listCollections } from "@sentry-api/core";
import { open } from "@tauri-apps/plugin-dialog";

export interface AppState {
  darkMode: boolean;
  selectedRequestId: string | null;
  selectedCollectionId: string | null;
  requests: RequestFile[];
  history: HistoryEntry[];
  response: { status: number; statusText: string; headers: Record<string, string>; data: unknown; duration: number } | null;
  loading: boolean;
  error: string | null;
  collections: { id: string; name: string; requests: RequestFile[] }[];
  basePath: string | null;
}

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [requests, setRequests] = useState<RequestFile[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [response, setResponse] = useState<AppState["response"]>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collections, setCollections] = useState<AppState["collections"]>([]);
  const [basePath, setBasePath] = useState<string | null>(null);

  // Persist history store across renders (not serialised, lives in memory)
  const historyStoreRef = useRef(createHistoryStore());

  /** Load collections from a folder on disk via the core library. */
  const loadCollections = useCallback((folderPath: string) => {
    try {
      const loaded = listCollections(folderPath);
      setCollections(loaded);
      setBasePath(folderPath);
      // Clear selection when switching folders
      setSelectedCollectionId(null);
      setSelectedRequestId(null);
      setRequests([]);
      setResponse(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  /** Open a folder picker (Tauri) and load collections from the chosen path. */
  const handleOpenFolder = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (typeof selected === "string") {
        loadCollections(selected);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [loadCollections]);

  /** Send a request through the core library and update response + history. */
  const handleSend = useCallback(async (request: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    query?: Record<string, string>;
    body?: unknown;
  }) => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const result = await sendRequest({
        method: request.method as RequestFile["method"],
        url: request.url,
        headers: request.headers,
        query: request.query,
        body: request.body,
      });

      if ("error" in result) {
        // Core returned an ErrorResponse
        const errResp = result as ErrorResponse;
        setError(errResp.error);
        setResponse(null);
      } else {
        // Core returned a successful Response
        const resp = result as Response;
        setResponse({
          status: resp.status,
          statusText: resp.statusText,
          headers: resp.headers,
          data: resp.data,
          duration: resp.duration,
        });

        // Persist to history
        const entry = addToHistory(
          historyStoreRef.current,
          {
            method: request.method as RequestFile["method"],
            url: request.url,
            headers: request.headers,
            query: request.query,
            body: request.body,
          },
          resp
        );
        setHistory([...historyStoreRef.current.entries]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [historyStoreRef]);

  /** Select a request from the sidebar and populate the editor. */
  const handleSelectRequest = useCallback((id: string) => {
    setSelectedRequestId(id);
    setResponse(null);
    setError(null);
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
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition"
          >
            {darkMode ? "☀️ Light" : "🌙 Dark"}
          </button>
        </header>

        {/* Main layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <Sidebar
            collections={collections}
            selectedCollectionId={selectedCollectionId}
            selectedRequestId={selectedRequestId}
            onSelectCollection={setSelectedCollectionId}
            onSelectRequest={handleSelectRequest}
            onOpenFolder={handleOpenFolder}
          />

          {/* Request Editor */}
          <RequestEditor
            selectedRequest={
              selectedRequestId
                ? requests.find((r) => r.id === selectedRequestId)
                : undefined
            }
            onSend={handleSend}
            loading={loading}
          />

          {/* Response Viewer */}
          <ResponseViewer
            response={response}
            loading={loading}
            error={error}
          />
        </div>

        {/* Bottom bar */}
        <footer className="h-6 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex items-center px-3 text-xs text-gray-500 dark:text-gray-400 shrink-0">
          <span>{collections.length} collections · {history.length} history entries</span>
        </footer>
      </div>
    </div>
  );
}
