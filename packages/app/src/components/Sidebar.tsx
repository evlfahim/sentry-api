import type { RequestFile } from "@sentry-api/core";

interface SidebarProps {
  collections: { id: string; name: string; requests: RequestFile[] }[];
  selectedCollectionId: string | null;
  selectedRequestId: string | null;
  onSelectCollection: (id: string | null) => void;
  onSelectRequest: (id: string) => void;
}

export default function Sidebar({
  collections,
  selectedCollectionId,
  selectedRequestId,
  onSelectCollection,
  onSelectRequest,
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
                      onClick={() => onSelectRequest(req.id)}
                      className={`w-full text-left px-3 py-1 text-xs flex items-center gap-2 hover:bg-gray-200 dark:hover:bg-gray-700 transition ${
                        selectedRequestId === req.id
                          ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300"
                          : "text-gray-600 dark:text-gray-400"
                      }`}
                    >
                      <span
                        className={`w-12 text-right font-mono text-[10px] px-1 rounded ${
                          req.method === "GET"
                            ? "text-green-600 dark:text-green-400"
                            : req.method === "POST"
                            ? "text-yellow-600 dark:text-yellow-400"
                            : req.method === "PUT"
                            ? "text-blue-600 dark:text-blue-400"
                            : req.method === "DELETE"
                            ? "text-red-600 dark:text-red-400"
                            : "text-gray-500 dark:text-gray-500"
                        }`}
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

      {/* Bottom actions */}
      <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-2">
        <button className="w-full text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition text-left">
          📂 Open Folder
        </button>
      </div>
    </aside>
  );
}
