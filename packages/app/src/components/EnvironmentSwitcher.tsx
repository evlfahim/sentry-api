import { useState, useCallback } from "react";
import { listEnvFiles, readEnvFile } from "../lib/api";
import type { Environment } from "@sentry-api/core/browser";

interface EnvironmentSwitcherProps {
  basePath: string | null;
  activeEnv: string | null;
  envValues: Record<string, string>;
  onEnvSelect: (name: string, values: Record<string, string>) => void;
}

export default function EnvironmentSwitcher({
  basePath,
  activeEnv,
  envValues,
  onEnvSelect,
}: EnvironmentSwitcherProps) {
  const [envFiles, setEnvFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEnvFiles = useCallback(async () => {
    if (!basePath) {
      setEnvFiles([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const files = await listEnvFiles(basePath);
      setEnvFiles(files);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(String(err));
      }
      setEnvFiles([]);
    } finally {
      setLoading(false);
    }
  }, [basePath]);

  const handleEnvSelect = useCallback(
    async (filename: string) => {
      if (!basePath) return;
      setLoading(true);
      try {
        const content = await readEnvFile(basePath, filename);
        const env: Environment = {
          name: filename.replace(/^\./, "").replace(/\.env$/, ""),
          values: {},
        };
        // Parse the .env content
        const lines = content.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIndex = trimmed.indexOf("=");
          if (eqIndex > 0) {
            const key = trimmed.substring(0, eqIndex).trim();
            let value = trimmed.substring(eqIndex + 1).trim();
            if (
              (value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))
            ) {
              value = value.slice(1, -1);
            }
            if (key) {
              env.values[key] = value;
            }
          }
        }
        onEnvSelect(filename, env.values);
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError(String(err));
        }
      } finally {
        setLoading(false);
      }
    },
    [basePath, onEnvSelect]
  );

  const handleClearEnv = useCallback(() => {
    onEnvSelect("", {});
  }, [onEnvSelect]);

  // Load env files when basePath changes
  useState(() => {
    loadEnvFiles();
  });

  if (!basePath) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 dark:text-gray-400">Env:</span>
      <select
        value={activeEnv || ""}
        onChange={(e) => {
          if (e.target.value) {
            handleEnvSelect(e.target.value);
          } else {
            handleClearEnv();
          }
        }}
        className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        disabled={loading}
      >
        <option value="">None</option>
        {envFiles.map((file) => (
          <option key={file} value={file}>
            {file}
          </option>
        ))}
      </select>
      {activeEnv && (
        <button
          onClick={handleClearEnv}
          className="text-xs px-1.5 py-0.5 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
          title="Clear environment"
        >
          ✕
        </button>
      )}
      {loading && <span className="text-xs text-gray-400">Loading...</span>}
      {error && (
        <span className="text-xs text-red-500 dark:text-red-400 truncate max-w-[200px]" title={error}>
          {error}
        </span>
      )}
      {activeEnv && Object.keys(envValues).length > 0 && (
        <span className="text-xs text-gray-400">
          {Object.keys(envValues).length} vars
        </span>
      )}
    </div>
  );
}
