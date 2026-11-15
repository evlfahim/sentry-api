interface ResponseViewerProps {
  response: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    data: unknown;
    duration: number;
  } | null;
  loading: boolean;
  error: string | null;
}

export default function ResponseViewer({
  response,
  loading,
  error,
}: ResponseViewerProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700">
      {/* Response header */}
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-800">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Response
        </h2>
        <div className="flex items-center gap-3">
          {response && (
            <>
              <span className="text-xs font-mono">
                Status:{" "}
                <span
                  className={
                    response.status < 300
                      ? "text-green-600 dark:text-green-400"
                      : response.status < 400
                      ? "text-yellow-600 dark:text-yellow-400"
                      : "text-red-600 dark:text-red-400"
                  }
                >
                  {response.status} {response.statusText}
                </span>
              </span>
              <span className="text-xs text-gray-400">
                {response.duration}ms
              </span>
            </>
          )}
        </div>
      </div>

      {/* Response body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-2xl mb-2">⏳</div>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                Sending request...
              </p>
            </div>
          </div>
        ) : error ? (
          <div className="p-4">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-2">
                Error
              </h3>
              <p className="text-xs text-red-500 dark:text-red-300 font-mono break-all">
                {error}
              </p>
            </div>
          </div>
        ) : response ? (
          <div className="p-4">
            {/* Response tabs */}
            <div className="flex border-b border-gray-200 dark:border-gray-700 mb-3">
              {["Body", "Headers", "Preview"].map((tab, i) => (
                <button
                  key={tab}
                  className={`px-3 py-1.5 text-xs font-medium border-b-2 transition ${
                    i === 0
                      ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                      : "border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Body tab */}
            <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              {formatResponseData(response.data)}
            </pre>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-4xl mb-3">📡</div>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                Send a request to see the response
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatResponseData(data: unknown): string {
  if (data === null || data === undefined) {
    return "(empty response)";
  }
  if (typeof data === "string") {
    return data;
  }
  if (typeof data === "object") {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }
  return String(data);
}
