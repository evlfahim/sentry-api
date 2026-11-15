import { describe, it, expect } from "vitest";
import { buildRequest, toCurl } from "../src/request-builder";

describe("buildRequest", () => {
  it("should build a request from a template", () => {
    const template = {
      id: "req-1",
      name: "Get Users",
      method: "GET",
      url: "https://api.example.com/users",
    };

    const result = buildRequest(template, {});
    expect(result).toEqual({
      method: "GET",
      url: "https://api.example.com/users",
    });
  });

  it("should interpolate URL with environment variables", () => {
    const template = {
      id: "req-1",
      name: "Get Users",
      method: "GET",
      url: "https://{{HOST}}/users",
    };
    const env = { HOST: "api.example.com" };

    const result = buildRequest(template, env);
    expect(result.url).toBe("https://api.example.com/users");
  });

  it("should interpolate headers with environment variables", () => {
    const template = {
      id: "req-1",
      name: "Authenticated Request",
      method: "GET",
      url: "https://api.example.com/users",
      headers: {
        Authorization: "Bearer {{TOKEN}}",
        Host: "{{HOST}}",
      },
    };
    const env = { TOKEN: "abc123", HOST: "api.example.com" };

    const result = buildRequest(template, env);
    expect(result.headers).toEqual({
      Authorization: "Bearer abc123",
      Host: "api.example.com",
    });
  });

  it("should interpolate query parameters", () => {
    const template = {
      id: "req-1",
      name: "Search",
      method: "GET",
      url: "https://api.example.com/search",
      query: {
        q: "{{QUERY}}",
        env: "{{ENV}}",
      },
    };
    const env = { QUERY: "test", ENV: "production" };

    const result = buildRequest(template, env);
    expect(result.query).toEqual({
      q: "test",
      env: "production",
    });
  });

  it("should interpolate body with environment variables", () => {
    const template = {
      id: "req-1",
      name: "Create User",
      method: "POST",
      url: "https://api.example.com/users",
      body: {
        name: "{{NAME}}",
        email: "{{EMAIL}}",
      },
    };
    const env = { NAME: "John", EMAIL: "john@example.com" };

    const result = buildRequest(template, env);
    expect(result.body).toEqual({
      name: "John",
      email: "john@example.com",
    });
  });

  it("should handle unknown environment variables gracefully", () => {
    const template = {
      id: "req-1",
      name: "Get Users",
      method: "GET",
      url: "https://{{HOST}}/users",
    };
    const env: Record<string, string> = {};

    const result = buildRequest(template, env);
    expect(result.url).toBe("https://{{HOST}}/users");
  });
});

describe("toCurl", () => {
  it("should generate a basic GET curl command", () => {
    const options = {
      method: "GET" as const,
      url: "https://api.example.com/users",
    };

    const result = toCurl(options);
    expect(result).toBe('curl -X GET "https://api.example.com/users"');
  });

  it("should generate a POST curl command with body", () => {
    const options = {
      method: "POST" as const,
      url: "https://api.example.com/users",
      headers: { "Content-Type": "application/json" },
      body: { name: "John", email: "john@example.com" },
    };

    const result = toCurl(options);
    expect(result).toContain("curl -X POST");
    expect(result).toContain('-H "Content-Type: application/json"');
    expect(result).toContain('"name": "John"');
  });

  it("should generate a PUT curl command with body", () => {
    const options = {
      method: "PUT" as const,
      url: "https://api.example.com/users/1",
      headers: { "Content-Type": "application/json" },
      body: { name: "Jane" },
    };

    const result = toCurl(options);
    expect(result).toContain("curl -X PUT");
    expect(result).toContain('"name": "Jane"');
  });

  it("should generate a DELETE curl command without body", () => {
    const options = {
      method: "DELETE" as const,
      url: "https://api.example.com/users/1",
    };

    const result = toCurl(options);
    expect(result).toBe('curl -X DELETE "https://api.example.com/users/1"');
  });

  it("should include query parameters in curl command", () => {
    const options = {
      method: "GET" as const,
      url: "https://api.example.com/search",
      query: { q: "test", page: "1" },
    };

    const result = toCurl(options);
    expect(result).toContain("q=test");
    expect(result).toContain("page=1");
  });

  it("should include timeout in curl command", () => {
    const options = {
      method: "GET" as const,
      url: "https://api.example.com/users",
      timeout: 5000,
    };

    const result = toCurl(options);
    expect(result).toContain("--max-time 5");
  });

  it("should handle multiple headers", () => {
    const options = {
      method: "POST" as const,
      url: "https://api.example.com/users",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token123",
        "X-Custom-Header": "custom-value",
      },
      body: { name: "test" },
    };

    const result = toCurl(options);
    expect(result).toContain('-H "Content-Type: application/json"');
    expect(result).toContain('-H "Authorization: Bearer token123"');
    expect(result).toContain('-H "X-Custom-Header: custom-value"');
  });
});
