/**
 * Browser-safe entry point of the core library.
 *
 * Everything exported here is free of Node built-ins (fs, path) and of
 * axios, so it can be bundled into the Tauri webview or a VS Code webview.
 * Transport (HTTP) and file system access are provided by the host.
 */
export * from "./types";
export * from "./env-core";
export * from "./request-builder";
export * from "./history";
export * from "./diff";
export * from "./results";
