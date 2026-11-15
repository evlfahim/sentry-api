import { useState, useEffect } from "react";
import type { RequestFile } from "@sentry-api/core";

interface RequestEditorProps {
  selectedRequest: RequestFile | undefined;
  onSend: (request: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    query?: Record<string, string>;
    body?: unknown;
  }) => Promise<void>;
  loading: boolean;
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

export default function RequestEditor({
  selectedRequest,
  onSend,
  loading,
}: RequestEditorProps) {
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState<string>("");
  const [queryParams, setQueryParams] = useState<string>("");
  const [body, setBody] = useState<string>("");
  const [bodyType, setBodyType] = useState<"json" | "raw" | "form">("json");

  // Load selected request into editor
  useEffect(() => {
    if (selectedRequest) {
      setMethod(selectedRequest.method);
      setUrl(selectedRequest.url);
      setHeaders(
        selectedRequest.headers
          ? Object.entries(selectedRequest.headers)
              .map(([k, v]) => `${k}: ${v}`)
              .join("\n")
          : ""
      );
      setQueryParams(
        selectedRequest.query
          ? Object.entries(selectedRequest.query)
              .map(([k, v]) => `${k}=${v}`)
              .join("\n")
          : ""
      );
      setBody(
        selectedRequest.body
          ? typeof selectedRequest.body === "string"
            ? selectedRequest.body
            : JSON.stringify(selectedRequest.body, null, 2)
          : ""
      );
    } else {
      setMethod("GET");
      setUrl("");
      setHeaders("");
      setQueryParams("");
      setBody("");
    }
  }, [selectedRequest]);

  const handleSend = async () => {
    // Parse headers
    const headersMap: Record<string, string> = {};
    if (headers.trim()) {
      for (const line of headers.trim().split("\n")) {
        const idx = line.indexOf(":");
        if (idx > 0) {
          headersMap[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
        }
      }
    }

    // Parse query params
    const queryMap: Record<string, string> = {};
    if (queryParams.trim()) {
      for (const line of queryParams.trim().split("\n")) {
        const idx = line.indexOf("=");
        if (idx > 0) {
          queryMap[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
        }
      }
    }

    // Parse body
    let bodyValue: unknown = undefined;
    if (body.trim()) {
      if (bodyType === "json") {
        try {
          bodyValue = JSON.parse(body);
        } catch {
          // Keep as string if not valid JSON
          bodyValue = body;
        }
      } else {
        bodyValue = body;
      }
    }

    await onSend({
      method,
      url,
      headers: Object.keys(headersMap).length > 0 ? headersMap : undefined,
      query: Object.keys(queryMap).length > 0 ? queryMap : undefined,
      body: bodyValue,
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900">
      {/* URL bar */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="px-2 py-1.5 text-xs font-mono font-bold rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter request URL..."
          className="flex-1 px-3 py-1.5 text-sm rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
        />
        <button
          onClick={handleSend}
          disabled={loading || !url}
          className="px-4 py-1.5 text-xs font-semibold rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading ? "⏳ Sending..." : "Send"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {["Headers", "Query", "Body", "Auth"].map((tab) => (
          <button
            key={tab}
            className="px-4 py-2 text-xs font-medium border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400"
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {/* Headers tab */}
        <div className="p-4">
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
            Headers
          </label>
          <textarea
            value={headers}
            onChange={(e) => setHeaders(e.target.value)}
            placeholder={"Content-Type: application/json\nAuthorization: Bearer token"}
            className="w-full h-32 px-3 py-2 text-xs font-mono rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>

        {/* Query tab */}
        <div className="p-4">
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
            Query Parameters
          </label>
          <textarea
            value={queryParams}
            onChange={(e) => setQueryParams(e.target.value)}
            placeholder={"key1=value1\nkey2=value2"}
            className="w-full h-32 px-3 py-2 text-xs font-mono rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>

        {/* Body tab */}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Body
            </label>
            <div className="flex gap-1">
              {(["json", "raw", "form"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setBodyType(t)}
                  className={`px-2 py-0.5 text-[10px] font-mono rounded ${
                    bodyType === t
                      ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                  }`}
                >
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              bodyType === "json"
                ? '{"key": "value"}'
                : bodyType === "form"
                ? "key1=value1&key2=value2"
                : "Raw body content..."
            }
            className="w-full h-48 px-3 py-2 text-xs font-mono rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>

        {/* Auth tab */}
        <div className="p-4">
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
            Authentication
          </label>
          <select className="w-full px-3 py-2 text-xs rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 mb-2">
            <option>No Auth</option>
            <option>Bearer Token</option>
            <option>Basic Auth</option>
            <option>API Key</option>
          </select>
          <input
            type="text"
            placeholder="Token or credentials..."
            className="w-full px-3 py-2 text-xs rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>
    </div>
  );
}
