import type { Collection, HistoryEntry } from "@sentry-api/core/browser";

interface SidebarProps {
  collections: Collection[];
  selectedCollectionId: string | null;
  selectedRequestId: string | null;
  onSelectCollection: (id: string | null) => void;
  onSelectRequest: (collectionId: string, requestId: string) => void;
  onOpenFolder: () => void;
  history: HistoryEntry[];
  selectedHistoryId: string | null;
  onSelectHistory: (id: string) => void;
  onClearHistory: () => void;
}

function methodColor(method: string): string {
  switch (method) {
    case "GET":
      return "text-green-600 dark:text-green-400";
    case "POST":
      return "text-yellow-600 dark:text-yellow-400";
    case "PUT":
      return "text-blue-600 dark:text-blue-400";
    case "DELETE":
      return "text-red-600 dark:text-red-400";
    default:
      return "text-gray-500 dark:text-gray-500";
  }
}

function statusColor(status: number): string {
  if (status < 300) return "text-green-600 dark:text-green-400";
  if (status < 400) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString();
}

export default function Sidebar({
  collections,
  selectedCollectionId,
  selectedRequestId,
  onSelectCollection,
  onSelectRequest,
  onOpenFolder,
  history,
  selectedHistoryId,
  onSelectHistory,
  onClearHistory,
}: SidebarProps) {
  return (
    <aside className="w-64 bg-gray-100 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col shrink-0">
      {/* Collections header */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Collections
        </h2>
        <button
          className="text-xs px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-800 transition"
          title="New collection"
        >
          +
        </button>
      </div>

      {/* Collections list */}
      <div className="flex-1 overflow-y-auto py-1">
        {collections.length === 0 ? (
          <div className="px-3 py-4 text-xs text-gray-400 dark:text-gray-500 text-center">
            No collections yet.
            <br />
            Open a folder to get started.
          </div>
        ) : (
          collections.map((collection) => (
            <div key={collection.id}>
              {/* Collection header */}
              <button
                onClick={() =>
                  onSelectCollection(
                    selectedCollectionId === collection.id ? null : collection.id
                  )
                }
                className="w-full text-left px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
              >
                <span className="text-gray-400">
                  {selectedCollectionId === collection.id ? "▾" : "▸"}
                </span>
                <span className="truncate">{collection.name}</span>
              </button>

              {/* Requests list */}
              {selectedCollectionId === collection.id && (
                <div className="pl-4">
                  {collection.requests.map((req) => (
                    <button
                      key={req.id}
                      onClick={() => onSelectRequest(collection.id, req.id)}
                      className={`w-full text-left px-3 py-1 text-xs flex items-center gap-2 hover:bg-gray-200 dark:hover:bg-gray-700 transition ${
                        selectedRequestId === req.id
                          ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300"
                          : "text-gray-600 dark:text-gray-400"
                      }`}
                    >
                      <span
                        className={`w-12 text-right font-mono text-[10px] px-1 rounded ${methodColor(req.method)}`}
                      >
                        {req.method}
                      </span>
                      <span className="truncate">{req.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* History */}
      <div className="border-t border-gray-200 dark:border-gray-700 flex flex-col max-h-[40%] min-h-[6rem]">
        <div className="px-3 py-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            History
          </h2>
          {history.length > 0 && (
            <button
              onClick={onClearHistory}
              className="text-[10px] px-1.5 py-0.5 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
              title="Clear history"
            >
              Clear
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto pb-1">
          {history.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 text-center">
              Sent requests appear here.
            </div>
          ) : (
            history.map((entry) => (
              <button
                key={entry.id}
                onClick={() => onSelectHistory(entry.id)}
                title={`${entry.request.method} ${entry.request.url}`}
                className={`w-full text-left px-3 py-1 text-xs flex items-center gap-2 hover:bg-gray-200 dark:hover:bg-gray-700 transition ${
                  selectedHistoryId === entry.id
                    ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300"
                    : "text-gray-600 dark:text-gray-400"
                }`}
              >
                <span className={`w-12 shrink-0 text-right font-mono text-[10px] ${methodColor(entry.request.method)}`}>
                  {entry.request.method}
                </span>
                <span className="truncate flex-1 font-mono text-[11px]">{entry.request.url}</span>
                <span className={`shrink-0 font-mono text-[10px] ${statusColor(entry.response.status)}`}>
                  {entry.response.status}
                </span>
                <span className="shrink-0 text-[10px] text-gray-400">{formatTime(entry.timestamp)}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Bottom actions */}
      <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-2">
        <button
          onClick={onOpenFolder}
          className="w-full text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition text-left"
        >
          📂 Open Folder
        </button>
      </div>
    </aside>
  );
}
