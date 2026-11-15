import fs from "fs";
import path from "path";
import { parseEnvFile } from "./env-core";
import type { Environment } from "./env-core";

export type { Environment, EnvironmentFile } from "./env-core";
export { parseEnvFile, interpolate, interpolateObject } from "./env-core";

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
export function writeEnvFile(filePath: string, environment: Environment): void {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(environment.values)) {
    lines.push(`${key}=${value}`);
  }

  fs.writeFileSync(filePath, lines.join("\n") + "\n");
}
