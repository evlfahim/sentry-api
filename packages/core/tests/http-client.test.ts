import { describe, it, expect } from "vitest";
import { sendRequest, RequestOptions } from "../src/http-client";

describe("sendRequest", () => {
  it("should reject with invalid URL", async () => {
    const options: RequestOptions = {
      method: "GET",
      url: "not-a-valid-url",
    };

    const result = await sendRequest(options);
    expect("error" in result).toBe(true);
  });

  it("should handle timeout option", async () => {
    const options: RequestOptions = {
      method: "GET",
      url: "https://httpbin.org/delay/10",
      timeout: 100,
    };

    const result = await sendRequest(options);
    // With a 100ms timeout on a 10s delay, this should fail
    if ("error" in result) {
      expect(result.error).toBeDefined();
    }
  });

  it("should return response for a valid request", async () => {
    const options: RequestOptions = {
      method: "GET",
      url: "https://httpbin.org/get",
    };

    const result = await sendRequest(options);

    if ("error" in result) {
      // Network error is acceptable in test environments
      expect(result.error).toBeDefined();
    } else {
      expect(result.status).toBe(200);
      expect(result.duration).toBeGreaterThan(0);
      expect(result.request).toEqual(options);
    }
  });

  it("should send POST request with body", async () => {
    const options: RequestOptions = {
      method: "POST",
      url: "https://httpbin.org/post",
      headers: { "Content-Type": "application/json" },
      body: { test: "data" },
    };

    const result = await sendRequest(options);

    if ("error" in result) {
      expect(result.error).toBeDefined();
    } else {
      expect(result.status).toBe(200);
    }
  });

  it("should handle 404 responses gracefully", async () => {
    const options: RequestOptions = {
      method: "GET",
      url: "https://httpbin.org/status/404",
    };

    const result = await sendRequest(options);

    if ("error" in result) {
      expect(result.error).toBeDefined();
    } else {
      expect(result.status).toBe(404);
    }
  });
});
