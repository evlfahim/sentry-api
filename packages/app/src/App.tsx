import { useState } from "react";
import Sidebar from "./components/Sidebar";
import RequestEditor from "./components/RequestEditor";
import ResponseViewer from "./components/ResponseViewer";
import type { RequestFile, HistoryEntry } from "@sentry-api/core";

export interface AppState {
  darkMode: boolean;
  selectedRequestId: string | null;
  selectedCollectionId: string | null;
  requests: RequestFile[];
  history: HistoryEntry[];
  response: { status: number; statusText: string; headers: Record<string, string>; data: unknown; duration: number } | null;
  loading: boolean;
  error: string | null;
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
            collections={[]}
            selectedCollectionId={selectedCollectionId}
            selectedRequestId={selectedRequestId}
            onSelectCollection={setSelectedCollectionId}
            onSelectRequest={(id) => {
              setSelectedRequestId(id);
              setResponse(null);
              setError(null);
            }}
          />

          {/* Request Editor */}
          <RequestEditor
            selectedRequest={
              selectedRequestId
                ? requests.find((r) => r.id === selectedRequestId)
                : undefined
            }
            onSend={async (request) => {
              setLoading(true);
              setError(null);
              try {
                // Placeholder: will connect to core library in step 6
                await new Promise((r) => setTimeout(r, 300));
                setResponse({
                  status: 200,
                  statusText: "OK",
                  headers: { "content-type": "application/json" },
                  data: { message: "Hello from Sentry API" },
                  duration: 42,
                });
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              } finally {
                setLoading(false);
              }
            }}
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
          <span>{requests.length} requests · {history.length} history entries</span>
        </footer>
      </div>
    </div>
  );
}
