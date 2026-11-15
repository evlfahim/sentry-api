import { useState, useEffect, useCallback, useRef } from "react";
import type { HttpMethod, RequestOptions } from "@sentry-api/core/browser";
import { exportCurl } from "../lib/api";

interface RequestEditorProps {
  /** Request to load into the editor (from a collection or a history replay). */
  selectedRequest: RequestOptions | undefined;
  onSend: (request: RequestOptions) => Promise<void>;
  loading: boolean;
}

const METHODS: readonly HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];
const TABS = ["Headers", "Query", "Body", "Auth"] as const;
type Tab = (typeof TABS)[number];

export default function RequestEditor({
  selectedRequest,
  onSend,
  loading,
}: RequestEditorProps) {
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [url, setUrl] = useState("");
  const headersRef = useRef("");
  const [headers, setHeaders] = useState<string>("");
  const queryParamsRef = useRef("");
  const [queryParams, setQueryParams] = useState<string>("");
  const bodyRef = useRef("");
  const [body, setBody] = useState<string>("");
  const [bodyType, setBodyType] = useState<"json" | "raw" | "form">("json");
  const [activeTab, setActiveTab] = useState<Tab>("Headers");
  const [curlExport, setCurlExport] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [curlError, setCurlError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

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
          : "",
      );
      setQueryParams(
        selectedRequest.query
          ? Object.entries(selectedRequest.query)
              .map(([k, v]) => `${k}=${v}`)
              .join("\n")
          : "",
      );
      setBody(
        selectedRequest.body
          ? typeof selectedRequest.body === "string"
            ? selectedRequest.body
            : JSON.stringify(selectedRequest.body, null, 2)
          : "",
      );
    } else {
      setMethod("GET");
      setUrl("");
      setHeaders("");
      setQueryParams("");
      setBody("");
    }
    setCurlExport(null);
    setCurlError(null);
    setCopied(false);
    setSendError(null);
  }, [selectedRequest]);

  // Keep refs in sync with state for the send/export functions
  useEffect(() => {
    headersRef.current = headers;
  }, [headers]);
  useEffect(() => {
    queryParamsRef.current = queryParams;
  }, [queryParams]);
  useEffect(() => {
    bodyRef.current = body;
  }, [body]);

  const parseHeaders = useCallback((text: string): Record<string, string> => {
    const headersMap: Record<string, string> = {};
    if (text.trim()) {
      for (const line of text.trim().split("\n")) {
        const idx = line.indexOf(":");
        if (idx > 0) {
          headersMap[line.substring(0, idx).trim()] = line
            .substring(idx + 1)
            .trim();
        }
      }
    }
    return headersMap;
  }, []);

  const parseQueryParams = useCallback(
    (text: string): Record<string, string> => {
      const queryMap: Record<string, string> = {};
      if (text.trim()) {
        for (const line of text.trim().split("\n")) {
          const idx = line.indexOf("=");
          if (idx > 0) {
            queryMap[line.substring(0, idx).trim()] = line
              .substring(idx + 1)
              .trim();
          }
        }
      }
      return queryMap;
    },
    [],
  );

  const parseBody = useCallback((text: string, type: string): unknown => {
    if (!text.trim()) return undefined;
    if (type === "json") {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
    return text;
  }, []);

  const buildRequest = useCallback((): RequestOptions => {
    return {
      method,
      url: url.trim(),
      headers:
        Object.keys(parseHeaders(headersRef.current)).length > 0
          ? parseHeaders(headersRef.current)
          : undefined,
      query:
        Object.keys(parseQueryParams(queryParamsRef.current)).length > 0
          ? parseQueryParams(queryParamsRef.current)
          : undefined,
      body: parseBody(bodyRef.current, bodyType),
    };
  }, [method, url, bodyType, parseHeaders, parseQueryParams, parseBody]);

  const handleSend = async () => {
    setSendError(null);
    const request = buildRequest();
    if (!request.url) {
      setSendError("URL is required");
      return;
    }
    try {
      await onSend(request);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSendError(msg);
    }
  };

  // Keyboard shortcut: Ctrl+Enter (or Cmd+Enter on Mac) to send
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSend();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSend]);

  const handleExportCurl = async () => {
    setCurlError(null);
    setCurlExport(null);
    const request = buildRequest();
    if (!request.url) {
      setCurlError("URL is required");
      return;
    }
    try {
      const curl = await exportCurl(request);
      setCurlExport(curl);
      setCopied(false);
    } catch (err) {
      setCurlError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCopyCurl = async () => {
    if (curlExport) {
      try {
        await navigator.clipboard.writeText(curlExport);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Clipboard not available
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900">
      {/* URL bar */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as HttpMethod)}
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
          onClick={handleExportCurl}
          disabled={loading || !url}
          className="px-3 py-1.5 text-xs font-semibold rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          title="Export as cURL"
        >
          📋 cURL
        </button>
        <button
          onClick={handleSend}
          disabled={loading || !url}
          className="px-4 py-1.5 text-xs font-semibold rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
          title="Send request (Ctrl+Enter)"
        >
          {loading ? (
            <>
              <span className="spinner" />
              Sending...
            </>
          ) : (
            "Send"
          )}
        </button>
      </div>

      {/* Send error banner */}
      {sendError && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 flex items-center justify-between">
          <span className="text-xs text-red-600 dark:text-red-400 font-mono">
            {sendError}
          </span>
          <button
            onClick={() => setSendError(null)}
            className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-300"
          >
            ✕
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-xs font-medium border-b-2 transition ${
              activeTab === tab
                ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {/* Headers tab */}
        {activeTab === "Headers" && (
          <div className="p-4">
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
              Headers
            </label>
            <textarea
              value={headers}
              onChange={(e) => setHeaders(e.target.value)}
              placeholder={
                "Content-Type: application/json\nAuthorization: Bearer token"
              }
              className="w-full h-32 px-3 py-2 text-xs font-mono rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
        )}

        {/* Query tab */}
        {activeTab === "Query" && (
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
        )}

        {/* Body tab */}
        {activeTab === "Body" && (
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
        )}

        {/* Auth tab */}
        {activeTab === "Auth" && (
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
        )}
      </div>

      {/* cURL export panel */}
      {curlExport && (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="px-4 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              cURL Export
            </span>
            <button
              onClick={handleCopyCurl}
              className="text-xs px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-800 transition"
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
          <pre className="text-xs font-mono whitespace-pre-wrap break-all p-4 max-h-40 overflow-y-auto">
            {curlExport}
          </pre>
        </div>
      )}
      {curlError && (
        <div className="border-t border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-2">
          <span className="text-xs text-red-600 dark:text-red-400 font-mono">
            {curlError}
          </span>
        </div>
      )}

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-black/10 dark:bg-black/30 flex items-center justify-center z-10">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 flex flex-col items-center gap-3">
            <div className="spinner" />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Sending request...
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
