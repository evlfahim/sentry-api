import fs from "fs";
import path from "path";

export interface Environment {
  name: string;
  values: Record<string, string>;
}

export interface EnvironmentFile {
  path: string;
  content: string;
}

/**
 * Parses a .env file into an Environment object.
 * Supports KEY=VALUE format, ignores comments and empty lines.
 */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Parse KEY=VALUE
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.substring(0, eqIndex).trim();
    let value = trimmed.substring(eqIndex + 1).trim();

    // Remove surrounding quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Reads a .env file from the given path and returns an Environment object.
 */
export function readEnvFile(filePath: string): Environment {
  const content = fs.readFileSync(filePath, "utf-8");
  const name = path.basename(filePath, path.extname(filePath));
  return {
    name,
    values: parseEnvFile(content),
  };
}

/**
 * Writes an Environment object to a .env file.
 */
export function writeEnvFile(
  filePath: string,
  environment: Environment
): void {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(environment.values)) {
    lines.push(`${key}=${value}`);
  }

  fs.writeFileSync(filePath, lines.join("\n") + "\n");
}

/**
 * Substitutes {{variable}} placeholders in a string with values from the environment.
 */
export function interpolate(
  template: string,
  env: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return env[key] ?? `{{${key}}}`;
  });
}

/**
 * Substitutes {{variable}} placeholders in an object (recursively for strings).
 */
export function interpolateObject<T>(
  obj: T,
  env: Record<string, string>
): T {
  if (typeof obj === "string") {
    return interpolate(obj, env) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => interpolateObject(item, env)) as unknown as T;
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = interpolateObject(value, env);
    }
    return result as T;
  }
  return obj;
}
