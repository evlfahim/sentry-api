import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  isErrorResponse,
  getHeader,
  parseResponseBody,
} from "../src/results";
import type { Response, ErrorResponse } from "../src/types";
import * as browser from "../src/browser";

const request = { method: "GET" as const, url: "https://example.com" };

describe("isErrorResponse", () => {
  it("returns true for an ErrorResponse", () => {
    const err: ErrorResponse = { error: "connection refused", request };
    expect(isErrorResponse(err)).toBe(true);
  });

  it("returns false for a successful Response", () => {
    const ok: Response = {
      status: 404,
      statusText: "Not Found",
      headers: {},
      data: null,
      duration: 5,
      request,
    };
    expect(isErrorResponse(ok)).toBe(false);
  });
});

describe("getHeader", () => {
  it("finds headers case-insensitively", () => {
    const headers = { "Content-Type": "application/json" };
    expect(getHeader(headers, "content-type")).toBe("application/json");
  });

  it("returns undefined for missing headers", () => {
    expect(getHeader({}, "x-missing")).toBeUndefined();
    expect(getHeader(undefined, "x-missing")).toBeUndefined();
  });
});

describe("parseResponseBody", () => {
  it("parses JSON when the content type is JSON", () => {
    expect(parseResponseBody('{"a":1}', "application/json; charset=utf-8")).toEqual({ a: 1 });
  });

  it("parses vendor +json content types", () => {
    expect(parseResponseBody("[1,2]", "application/problem+json")).toEqual([1, 2]);
  });

  it("parses JSON-looking bodies without a content type", () => {
    expect(parseResponseBody('  {"ok":true}')).toEqual({ ok: true });
  });

  it("keeps invalid JSON as text", () => {
    expect(parseResponseBody("{not json", "application/json")).toBe("{not json");
  });

  it("keeps non-JSON bodies as text", () => {
    expect(parseResponseBody("<html></html>", "text/html")).toBe("<html></html>");
  });

  it("returns null for an empty body", () => {
    expect(parseResponseBody("", "application/json")).toBeNull();
  });
});

describe("browser entry point", () => {
  it("exposes the webview-safe API", () => {
    expect(typeof browser.buildRequest).toBe("function");
    expect(typeof browser.toCurl).toBe("function");
    expect(typeof browser.interpolate).toBe("function");
    expect(typeof browser.parseEnvFile).toBe("function");
    expect(typeof browser.createHistoryStore).toBe("function");
    expect(typeof browser.addToHistory).toBe("function");
    expect(typeof browser.replayEntry).toBe("function");
    expect(typeof browser.serializeHistory).toBe("function");
    expect(typeof browser.deserializeHistory).toBe("function");
    expect(typeof browser.diff).toBe("function");
    expect(typeof browser.isErrorResponse).toBe("function");
    expect(typeof browser.parseResponseBody).toBe("function");
  });

  it("does not import Node built-ins or axios", () => {
    const srcDir = fileURLToPath(new URL("../src", import.meta.url));
    const browserModules = [
      "browser.ts",
      "types.ts",
      "env-core.ts",
      "request-builder.ts",
      "history.ts",
      "diff.ts",
      "results.ts",
    ];
    for (const file of browserModules) {
      const source = fs.readFileSync(path.join(srcDir, file), "utf-8");
      expect(source, file).not.toMatch(/from\s+["'](fs|path|os|axios)["']/);
      expect(source, file).not.toMatch(/from\s+["']\.\/(http-client|environment|collections)["']/);
    }
  });
});
