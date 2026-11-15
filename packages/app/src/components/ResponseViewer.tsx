import { useState } from "react";
import { diff, type DiffResult } from "@sentry-api/core/browser";

const TABS = ["Body", "Headers", "Diff", "Preview"] as const;
type Tab = (typeof TABS)[number];

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
  /** Previous response to compare against (for diff view). */
  previousResponse: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    data: unknown;
    duration: number;
  } | null;
}

export default function ResponseViewer({
  response,
  loading,
  error,
  previousResponse,
}: ResponseViewerProps) {
  const [activeTab, setActiveTab] = useState<Tab>("Body");

  // Compute diff between previous and current response
  const diffResults: DiffResult[] =
    response && previousResponse
      ? diff(previousResponse.data, response.data)
      : [];

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
              {previousResponse && (
                <span className="text-xs text-indigo-500 dark:text-indigo-400">
                  {diffResults.length} change
                  {diffResults.length !== 1 ? "s" : ""}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Response body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            {/* Skeleton loading */}
            <div className="skeleton h-4 w-24" />
            <div className="skeleton h-40 w-full" />
            <div className="skeleton h-4 w-32" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-20" />
          </div>
        ) : error ? (
          <div className="p-4">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">❌</span>
                <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">
                  Request Failed
                </h3>
              </div>
              <p className="text-xs text-red-500 dark:text-red-300 font-mono break-all">
                {error}
              </p>
            </div>
          </div>
        ) : response ? (
          <div className="p-4">
            {/* Response tabs */}
            <div className="flex border-b border-gray-200 dark:border-gray-700 mb-3">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 text-xs font-medium border-b-2 transition ${
                    activeTab === tab
                      ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                      : "border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  }`}
                >
                  {tab}
                  {tab === "Diff" && diffResults.length > 0 && (
                    <span className="ml-1 px-1 py-0.5 text-[10px] bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 rounded-full">
                      {diffResults.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {activeTab === "Body" && (
              <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 max-h-[calc(100vh-12rem)] overflow-y-auto">
                {formatResponseData(response.data)}
              </pre>
            )}

            {activeTab === "Headers" && (
              <table className="w-full text-xs font-mono bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <tbody>
                  {Object.entries(response.headers).map(([key, value]) => (
                    <tr
                      key={key}
                      className="border-b border-gray-100 dark:border-gray-700 last:border-0"
                    >
                      <td className="px-3 py-1.5 font-semibold text-gray-600 dark:text-gray-300 align-top whitespace-nowrap">
                        {key}
                      </td>
                      <td className="px-3 py-1.5 break-all">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {activeTab === "Diff" && (
              <div>
                {diffResults.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-2xl mb-2">✓</div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      No differences from previous response
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {diffResults.map((d, i) => (
                      <div
                        key={i}
                        className={`p-3 rounded-lg border text-xs font-mono ${
                          d.type === "changed"
                            ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
                            : d.type === "added"
                              ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                              : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`font-bold ${
                              d.type === "changed"
                                ? "text-yellow-600 dark:text-yellow-400"
                                : d.type === "added"
                                  ? "text-green-600 dark:text-green-400"
                                  : "text-red-600 dark:text-red-400"
                            }`}
                          >
                            {d.type === "changed"
                              ? "~"
                              : d.type === "added"
                                ? "+"
                                : "-"}
                          </span>
                          <span className="font-semibold text-gray-700 dark:text-gray-300">
                            {d.path || "(root)"}
                          </span>
                        </div>
                        {d.old !== undefined && (
                          <div className="ml-4 text-red-600 dark:text-red-400">
                            - {JSON.stringify(d.old)}
                          </div>
                        )}
                        {d.new !== undefined && (
                          <div className="ml-4 text-green-600 dark:text-green-400">
                            + {JSON.stringify(d.new)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "Preview" && (
              <iframe
                title="Response preview"
                sandbox=""
                srcDoc={formatResponseData(response.data)}
                className="w-full h-96 bg-white rounded-lg border border-gray-200 dark:border-gray-700"
              />
            )}
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
