import { describe, it, expect } from "vitest";
import {
  parseEnvFile,
  interpolate,
  interpolateObject,
} from "../src/environment";

describe("parseEnvFile", () => {
  it("should parse simple KEY=VALUE pairs", () => {
    const content = `API_KEY=abc123
BASE_URL=https://api.example.com
PORT=3000`;

    const result = parseEnvFile(content);
    expect(result).toEqual({
      API_KEY: "abc123",
      BASE_URL: "https://api.example.com",
      PORT: "3000",
    });
  });

  it("should ignore comments and empty lines", () => {
    const content = `
# This is a comment
API_KEY=abc123

# Another comment
BASE_URL=https://api.example.com
`;

    const result = parseEnvFile(content);
    expect(result).toEqual({
      API_KEY: "abc123",
      BASE_URL: "https://api.example.com",
    });
  });

  it("should handle quoted values", () => {
    const content = `API_KEY="abc123"
BASE_URL='https://api.example.com'`;

    const result = parseEnvFile(content);
    expect(result).toEqual({
      API_KEY: "abc123",
      BASE_URL: "https://api.example.com",
    });
  });

  it("should handle values with spaces", () => {
    const content = `MESSAGE=Hello World
GREETING="Hello, World!"`;

    const result = parseEnvFile(content);
    expect(result).toEqual({
      MESSAGE: "Hello World",
      GREETING: "Hello, World!",
    });
  });

  it("should ignore lines without equals sign", () => {
    const content = `VALID_KEY=value
INVALID_LINE`;

    const result = parseEnvFile(content);
    expect(result).toEqual({
      VALID_KEY: "value",
    });
  });
});

describe("interpolate", () => {
  it("should replace {{variable}} with env values", () => {
    const template = "https://{{HOST}}:{{PORT}}/api";
    const env = { HOST: "api.example.com", PORT: "3000" };

    const result = interpolate(template, env);
    expect(result).toBe("https://api.example.com:3000/api");
  });

  it("should leave unknown variables unchanged", () => {
    const template = "https://{{HOST}}/api/{{VERSION}}";
    const env = { HOST: "api.example.com" };

    const result = interpolate(template, env);
    expect(result).toBe("https://api.example.com/api/{{VERSION}}");
  });

  it("should handle empty environment", () => {
    const template = "https://{{HOST}}/api";
    const env: Record<string, string> = {};

    const result = interpolate(template, env);
    expect(result).toBe("https://{{HOST}}/api");
  });

  it("should handle multiple occurrences of the same variable", () => {
    const template = "https://{{HOST}}/api/{{HOST}}/v1";
    const env = { HOST: "api.example.com" };

    const result = interpolate(template, env);
    expect(result).toBe("https://api.example.com/api/api.example.com/v1");
  });
});

describe("interpolateObject", () => {
  it("should interpolate strings in an object", () => {
    const obj = {
      url: "https://{{HOST}}/api",
      name: "test",
    };
    const env = { HOST: "api.example.com" };

    const result = interpolateObject(obj, env);
    expect(result).toEqual({
      url: "https://api.example.com/api",
      name: "test",
    });
  });

  it("should interpolate strings in nested objects", () => {
    const obj = {
      request: {
        url: "https://{{HOST}}/api",
        headers: {
          Host: "{{HOST}}",
        },
      },
    };
    const env = { HOST: "api.example.com" };

    const result = interpolateObject(obj, env);
    expect(result).toEqual({
      request: {
        url: "https://api.example.com/api",
        headers: {
          Host: "api.example.com",
        },
      },
    });
  });

  it("should interpolate strings in arrays", () => {
    const obj = {
      urls: ["https://{{HOST}}/api", "https://{{HOST}}/v2"],
    };
    const env = { HOST: "api.example.com" };

    const result = interpolateObject(obj, env);
    expect(result).toEqual({
      urls: [
        "https://api.example.com/api",
        "https://api.example.com/v2",
      ],
    });
  });

  it("should not modify non-string values", () => {
    const obj = {
      count: 42,
      enabled: true,
      nothing: null,
      name: "{{HOST}}",
    };
    const env = { HOST: "api.example.com" };

    const result = interpolateObject(obj, env);
    expect(result).toEqual({
      count: 42,
      enabled: true,
      nothing: null,
      name: "api.example.com",
    });
  });

  it("should handle empty object", () => {
    const obj = {};
    const env = { HOST: "api.example.com" };

    const result = interpolateObject(obj, env);
    expect(result).toEqual({});
  });

  it("should handle empty array", () => {
    const obj = { items: [] };
    const env = { HOST: "api.example.com" };

    const result = interpolateObject(obj, env);
    expect(result).toEqual({ items: [] });
  });
});
