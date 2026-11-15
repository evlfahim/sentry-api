# sentry-api

A git-native REST API client with file-based collections, response diffing, and a modular core designed for instant VS Code plugin conversion.

## Why it is better than what exists

- **Git-friendly**: One-file-per-request structure enables clean diffs and conflict-free merges, unlike Postman's monolithic JSON.
- **Built-in response diffing**: Catches breaking changes instantly, a feature missing in APITester and ApiForge.
- **Modular core**: Core logic in `packages/core` as a pure TypeScript library enables seamless VS Code plugin integration without the overhead of Frap's standalone desktop architecture.
- **Local-first**: Zero cloud dependency and full privacy, unlike cloud-synced alternatives.

## Features

- Collections stored as plain JSON files in the repository.
- One-file-per-request layout for granular git versioning.
- Environment variables via `.env` files with `{{variable}}` substitution.
- Request history with one-click replay and search.
- Response diff viewer highlighting JSON/text differences.
- cURL command export for any request.
- Core library architecture enabling VS Code plugin wrapper.
- Offline support with local file system access.
- Dark/Light theme with developer-focused UI.

## Stack

TypeScript, Node.js, Tauri (desktop UI), VS Code Extension API, Vitest, Tailwind CSS, Rust (Tauri backend)

## Project Structure

```
packages/
├── core/          # Pure TypeScript library (HTTP client, env parsing, collections, history, diff)
├── app/           # Tauri desktop application with sidebar, editor, and response viewer
└── vscode/        # VS Code extension with webview, file system integration, and panels
```

## Getting Started

### Prerequisites

- Node.js 22+
- npm
- (Optional) Rust toolchain for Tauri desktop app development

### Install Dependencies

```bash
npm install
```

### Build All Packages

```bash
npm run build
```

### Run Tests

```bash
npm run test          # Core library tests (100 tests)
cd packages/vscode && npx vitest run   # VS Code extension tests (25 tests)
```

### Run Tauri Desktop App

```bash
cd packages/app && npx tauri dev
```

## Usage

### Desktop App (Tauri)

1. Open the app with `npx tauri dev` in `packages/app/`.
2. Select a folder containing API request files.
3. Browse collections in the sidebar, edit requests, and send them.
4. View responses, check history, and diff between requests.

### VS Code Extension

1. Open the `packages/vscode` folder in VS Code.
2. Run `npm run build` to compile the extension.
3. Press `F5` to launch the Extension Development Host.
4. Use the command palette to run commands:
   - `Sentry API: Open API Folder` — Select a folder containing API requests.
   - `Sentry API: New Request` — Create a new request file.
   - `Sentry API: Send Request` — Send the current request.
   - `Sentry API: View History` — Open the history panel.
   - `Sentry API: Diff Responses` — Compare two response history entries.
   - `Sentry API: Export cURL` — Copy cURL command to clipboard.
   - `Sentry API: Open Collection` — Browse and open collections.
   - `Sentry API: Save Request` — Save the current request to disk.
   - `Sentry API: Create Collection` — Create a new collection folder.
   - `Sentry API: Create Env File` — Create a new environment file.
   - `Sentry API: Open Request File` — Open the request file in the editor.
   - `Sentry API: Watch Files` — Enable file watching for external changes.

### Core Library

Use the core library independently in any Node.js or browser environment:

```typescript
import { sendRequest, interpolate, createHistoryStore, addToHistory, diff } from "@sentry-api/core";

// Send a request with environment variable interpolation
const env = { HOST: "api.example.com", TOKEN: "abc123" };
const response = await sendRequest({
  method: "GET",
  url: interpolate("https://{{HOST}}/api", env),
  headers: { Authorization: `Bearer {{TOKEN}}` },
});

// Manage history
const store = createHistoryStore(1000);
addToHistory(store, { method: "GET", url: "https://api.example.com" }, response);

// Diff responses
const diffs = diff(response.data, previousResponseData);
```

## VS Code File System Integration

The VS Code extension uses `vscode.workspace.fs` for all file operations, enabling:

- **Opening folders**: Select a folder via VS Code's native file picker.
- **Saving requests**: Write request files directly to the workspace using `vscode.workspace.fs.writeFile`.
- **Reading collections**: List and read collection metadata and request files via `vscode.workspace.fs.readDirectory` and `vscode.workspace.fs.readFile`.
- **Environment files**: Read and write `.env` files through the VS Code file system adapter.
- **File watching**: Use `vscode.workspace.createFileSystemWatcher` to detect external changes and auto-refresh.
- **Opening files**: Open request JSON files directly in the VS Code editor.

The `VsCodeFileSystem` class in `packages/vscode/src/vscode-fs.ts` provides a unified abstraction over VS Code's file system API, mirroring the core library's file operations while using the extension host's file system.

## Converting the Core to a Plugin

The core library (`packages/core`) is designed to be framework-agnostic:

1. The browser-safe entry point (`packages/core/src/browser.ts`) exports everything except Node-specific modules (fs, path).
2. HTTP transport is provided by the host (browser fetch, Tauri commands, or VS Code webview).
3. File system operations are provided by the host (Tauri fs module, VS Code workspace.fs).
4. To create a new plugin, create a new package that imports from `@sentry-api/core` and maps host APIs to the core interface.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Host Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Tauri App  │  │ VS Code Ext  │  │  Browser Webview │  │
│  │  (Rust+HTML) │  │  (JS+HTML)   │  │  (fetch+DOM)     │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                    │            │
│         └─────────────────┼────────────────────┘            │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              @sentry-api/core                       │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │    │
│  │  │ HTTP     │ │ Env      │ │ Collections│            │    │
│  │  │ Client   │ │ Parser   │ │ & Requests │            │    │
│  │  └──────────┘ └──────────┘ └──────────┘            │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │    │
│  │  │ History  │ │ Diff     │ │ Results  │            │    │
│  │  └──────────┘ └──────────┘ └──────────┘            │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## License

MIT
