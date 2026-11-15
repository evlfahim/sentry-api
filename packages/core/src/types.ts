/**
 * Shared data types for the core library. This file has no runtime
 * dependencies so it can be used from Node, a browser webview, or VS Code.
 */

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export interface RequestOptions {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

export interface Response {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: unknown;
  duration: number;
  request: RequestOptions;
}

export interface ErrorResponse {
  error: string;
  request?: RequestOptions;
  details?: unknown;
}

export interface RequestFile {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  description?: string;
  updated: string; // ISO timestamp
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  requests: RequestFile[];
  updated: string; // ISO timestamp
}

export interface CollectionFolder {
  id: string;
  name: string;
  description?: string;
  children: CollectionFolder | RequestFile[];
  updated: string;
}
