import type { ErrorResponse, Response } from "./types";

/**
 * Type guard distinguishing an ErrorResponse from a successful Response.
 */
export function isErrorResponse(
  result: Response | ErrorResponse
): result is ErrorResponse {
  return (
    typeof (result as ErrorResponse).error === "string" &&
    typeof (result as Response).status !== "number"
  );
}

/**
 * Finds a header value case-insensitively.
 */
export function getHeader(
  headers: Record<string, string> | undefined,
  name: string
): string | undefined {
  if (!headers) {
    return undefined;
  }
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) {
      return value;
    }
  }
  return undefined;
}

/**
 * Converts a raw response body (text) into the value stored in
 * `Response.data`: JSON bodies are parsed, everything else stays text.
 * An empty body becomes `null`.
 */
export function parseResponseBody(
  text: string,
  contentType?: string
): unknown {
  if (text === "") {
    return null;
  }

  const looksJson =
    (contentType !== undefined && /[/+]json\b/i.test(contentType)) ||
    /^\s*[{[]/.test(text);

  if (looksJson) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}
