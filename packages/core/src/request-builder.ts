import { RequestOptions } from "./http-client";
import { interpolate, interpolateObject } from "./environment";

export interface RequestTemplate {
  id: string;
  name: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  url: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  description?: string;
}

/**
 * Builds a RequestOptions from a RequestTemplate, interpolating environment variables.
 */
export function buildRequest(
  template: RequestTemplate,
  env: Record<string, string>
): RequestOptions {
  const url = interpolate(template.url, env);
  const headers = template.headers
    ? interpolateObject(template.headers, env)
    : undefined;
  const query = template.query
    ? interpolateObject(template.query, env)
    : undefined;
  const body = template.body ? interpolateObject(template.body, env) : undefined;

  return {
    method: template.method,
    url,
    headers,
    query,
    body,
  };
}

/**
 * Converts a RequestOptions to a cURL command string.
 */
export function toCurl(options: RequestOptions): string {
  const method = options.method;
  let curl = `curl -X ${method}`;

  // Add headers
  if (options.headers) {
    for (const [key, value] of Object.entries(options.headers)) {
      curl += ` -H "${key}: ${value}"`;
    }
  }

  // Add query parameters
  if (options.query) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(options.query)) {
      searchParams.append(key, value);
    }
    const separator = options.url.includes("?") ? "&" : "?";
    curl += ` "${options.url}${separator}${searchParams.toString()}"`;
  } else {
    curl += ` "${options.url}"`;
  }

  // Add body
  if (options.body && ["POST", "PUT", "PATCH"].includes(method)) {
    const bodyStr =
      typeof options.body === "string"
        ? options.body
        : JSON.stringify(options.body, null, 2);
    curl += ` -d '${bodyStr}'`;
  }

  // Add timeout
  if (options.timeout) {
    curl += ` --max-time ${options.timeout / 1000}`;
  }

  return curl;
}
