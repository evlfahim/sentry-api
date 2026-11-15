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

| Layer | Technology |
|-------|-----------|
| Core library | TypeScript (pure, no dependencies on host APIs) |
| Desktop UI | Tauri 2 (Rust backend + React frontend, Tailwind CSS) |
| VS Code plugin | VS Code Extension API (TypeScript, webview) |
| Testing | Vitest (unit + integration) |
| HTTP transport | Axios (core), reqwest (Tauri backend) |

## Project Structure

```
packages/
├── core/          # Pure TypeScript library (HTTP client, env parsing, collections, history, diff)
├── app/           # Tauri desktop application with sidebar, editor, and response viewer
└── vscode/        # VS Code extension with webview, file system integration, and panels
```

### Core Library (`packages/core`)

| Module | Description |
|--------|-------------|
| `src/types.ts` | Shared types: `RequestOptions`, `Response`, `RequestFile`, `Collection`, `HistoryEntry`, `DiffResult` |
| `src/http-client.ts` | HTTP client using Axios; `sendRequest()` returns `Response` or `ErrorResponse` |
| `src/request-builder.ts` | `buildRequest()` interpolates env vars into templates; `toCurl()` exports cURL commands |
| `src/environment.ts` | File-system-aware `.env` reading/writing (`readEnvFile`, `writeEnvFile`) |
| `src/env-core.ts` | Pure env helpers: `parseEnvFile()`, `interpolate()`, `interpolateObject()` — no file-system deps |
| `src/collections.ts` | Collection CRUD: `readCollection()`, `writeCollection()`, `createCollection()`, `listCollections()`, `migrateCollection()` |
| `src/history.ts` | In-memory history store: `createHistoryStore()`, `addToHistory()`, `replayEntry()`, `searchHistory()`, `serializeHistory()` |
| `src/diff.ts` | Recursive JSON diff: `diff()`, `formatDiff()`, `formatDiffs()` — tracks added/removed/changed paths |
| `src/results.ts` | Type guards and helpers: `isErrorResponse()`, `getHeader()`, `parseResponseBody()` |
| `src/browser.ts` | Browser-safe entry point — exports everything except Node-specific modules (fs, path, axios) |
| `src/index.ts` | Full Node.js entry point — re-exports all modules |

### Desktop App (`packages/app`)

| Module | Description |
|--------|-------------|
| `src/App.tsx` | Main React component: sidebar, request editor, response viewer, history, toast notifications |
| `src/lib/api.ts` | Tauri command bridge: `sendHttpRequest()`, `loadCollections()`, `loadHistory()`, `saveHistory()`, `watchCollections()` |
| `src/components/Sidebar.tsx` | Collection tree, request list, history panel, clear history |
| `src/components/RequestEditor.tsx` | Method selector, URL input, headers, query params, body editor |
| `src/components/ResponseViewer.tsx` | Response display with status, headers, body, and diff comparison |
| `src/components/EnvironmentSwitcher.tsx` | Environment file selector and variable display |
| `src/components/Toast.tsx` | Auto-dismissing toast notifications |
| `src-tauri/src/lib.rs` | Rust backend: HTTP requests via reqwest, file operations, file watching, history persistence |
| `src-tauri/src/main.rs` | Tauri entry point |

### VS Code Extension (`packages/vscode`)

| Module | Description |
|--------|-------------|
| `src/extension.ts` | Extension activation, command registration, lifecycle management |
| `src/webview.ts` | Main webview manager: state management, message handling, content generation |
| `src/vscode-fs.ts` | `VsCodeFileSystem` class — wraps `vscode.workspace.fs` to mirror core library file operations |
| `src/history-panel.ts` | Separate webview panel for browsing and searching request history |
| `src/diff-panel.ts` | Separate webview panel for comparing two response history entries |

## Getting Started

### Prerequisites

- **Node.js** 22+
- **npm** (comes with Node)
- **Rust toolchain** (optional, required only for Tauri desktop app development)
  - Install via [rustup](https://rustup.rs/): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
  - Then: `cargo --version` should print a version number

### Install Dependencies

```bash
npm install
```

This installs dependencies for all three packages in the monorepo.

### Build All Packages

```bash
npm run build
```

This compiles:
- `packages/core` → `dist/` (TypeScript to JavaScript + `.d.ts` declarations)
- `packages/app` → `dist/` (TypeScript + Vite production build)
- `packages/vscode` → `dist/` (TypeScript compilation)

### Run Tests

```bash
npm run test          # Core library tests (100 tests, 7 test files)
cd packages/vscode && npx vitest run   # VS Code extension tests (167 tests, 5 test files)
```

Total: **267 tests**, all passing.

### Run Tauri Desktop App

```bash
cd packages/app && npx tauri dev
```

This launches the desktop application with hot-reload. The app opens a folder containing API request files and displays them in the sidebar.

## Usage

### Desktop App (Tauri)

1. Open the app with `npx tauri dev` in `packages/app/`.
2. Click **"Open Folder"** in the sidebar to select a folder containing API request files.
3. Browse collections in the sidebar tree. Each collection folder contains a `collection.json` metadata file and one `.json` file per request.
4. Click a request to load it into the editor. Edit the method, URL, headers, query parameters, and body.
5. Click **"Send"** (or press `Ctrl+Enter`) to execute the request.
6. View the response in the right panel: status code, headers, and body.
7. Click **"View History"** to see all previously sent requests. Click a history entry to replay it.
8. Click **"Diff Responses"** to compare two history entries side by side.
9. Click **"Export cURL"** to copy the cURL command for the current request to your clipboard.
10. Use the **Environment Switcher** in the top bar to load a `.env` file. Variables defined there are substituted into requests using `{{variable}}` syntax.
11. Toggle **Dark/Light mode** with the sun/moon button in the top bar.
12. The app watches for external file changes and auto-refreshes the collection list.

### VS Code Extension

1. Open the `packages/vscode` folder in VS Code.
2. Run `npm run build` to compile the extension.
3. Press **F5** to launch the Extension Development Host (EDH).
4. A new VS Code window opens with the extension loaded. Use the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) to run commands:

| Command | Description |
|---------|-------------|
| `Sentry API: Open API Folder` | Select a folder containing API request files |
| `Sentry API: New Request` | Create a new request file |
| `Sentry API: Send Request` | Send the current request |
| `Sentry API: View History` | Open the history panel |
| `Sentry API: Diff Responses` | Compare two response history entries |
| `Sentry API: Export cURL` | Copy cURL command to clipboard |
| `Sentry API: Open Collection` | Browse and open collections |
| `Sentry API: Save Request` | Save the current request to disk |
| `Sentry API: Create Collection` | Create a new collection folder |
| `Sentry API: Create Env File` | Create a new environment file |
| `Sentry API: Open Request File` | Open the request file in the editor |
| `Sentry API: Watch Files` | Enable file watching for external changes |

5. A **"Sentry API"** view appears in the Explorer sidebar. Right-click or use the `+` button to create new requests and collections.
6. The extension uses VS Code's native file system APIs (`vscode.workspace.fs`) for all file operations, ensuring compatibility with remote workspaces, GitHub Codespaces, and WSL.

### Core Library

Use the core library independently in any Node.js or browser environment:

```typescript
import {
  sendRequest,
  interpolate,
  interpolateObject,
  buildRequest,
  toCurl,
  createHistoryStore,
  addToHistory,
  diff,
  formatDiffs,
  isErrorResponse,
  readCollection,
  writeCollection,
  listCollections,
  createCollection,
  readRequest,
  updateRequest,
  deleteRequest,
  readEnvFile,
  writeEnvFile,
  parseEnvFile,
  getHeader,
  parseResponseBody,
  searchHistory,
  filterByMethod,
  filterByStatus,
  replayEntry,
  serializeHistory,
  deserializeHistory,
  clearHistory,
} from "@sentry-api/core";

// ── Send a request with environment variable interpolation ──
const env = { HOST: "api.example.com", TOKEN: "abc123" };
const response = await sendRequest({
  method: "GET",
  url: interpolate("https://{{HOST}}/api", env),
  headers: { Authorization: `Bearer {{TOKEN}}` },
});

// ── Build a request from a template ──
const template = {
  id: "get-users",
  name: "Get Users",
  method: "GET",
  url: "https://{{HOST}}/api/users",
  headers: { Authorization: "Bearer {{TOKEN}}" },
  query: { page: "1", limit: "50" },
};
const options = buildRequest(template, env);
const result = await sendRequest(options);

// ── Export as cURL ──
const curl = toCurl(options);
// → "curl -X GET -H \"Authorization: Bearer abc123\" \"https://api.example.com/api/users?page=1&limit=50\""

// ── Manage history ──
const store = createHistoryStore(1000);
if (!isErrorResponse(result)) {
  addToHistory(store, options, result);
}
const entries = searchHistory(store, "users");
const replayed = replayEntry(store, entries[0]?.id);

// ── Diff responses ──
const previousData = { users: [{ id: 1, name: "Alice" }] };
const currentData = { users: [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }] };
const diffs = diff(previousData, currentData);
console.log(formatDiffs(diffs));
// → "~ users[1]: undefined → {\"id\":2,\"name\":\"Bob\"}"

// ── File-based collections ──
const collections = listCollections("./my-api-requests");
const collection = readCollection("./my-api-requests/users");
const request = readRequest("./my-api-requests/users", "get-users");
updateRequest("./my-api-requests/users", { ...request, url: "https://v2.example.com/api/users" });
deleteRequest("./my-api-requests/users", "get-users");

// ── Environment files ──
const envFile = readEnvFile("./.env.production");
// → { name: ".env.production", values: { HOST: "api.example.com", ... } }
writeEnvFile("./.env.staging", { name: ".env.staging", values: { HOST: "staging.example.com" } });

// ── Parse .env content directly (no file I/O) ──
const values = parseEnvFile("HOST=api.example.com\nTOKEN=abc123");
// → { HOST: "api.example.com", TOKEN: "abc123" }
```

### Browser-Safe Core

For browser environments (webviews, SPAs), use the browser entry point which excludes Node-specific modules:

```typescript
import {
  interpolate,
  interpolateObject,
  buildRequest,
  createHistoryStore,
  addToHistory,
  diff,
  formatDiffs,
  isErrorResponse,
  getHeader,
  parseResponseBody,
  searchHistory,
  replayEntry,
} from "@sentry-api/core/browser";

// All of these work in the browser — no fs, path, or axios dependencies.
// HTTP transport must be provided by the host (fetch, XHR, etc.).
```

## File Format

### Collection Folder Structure

```
my-api-requests/
├── users/
│   ├── collection.json        # Collection metadata
│   ├── list.json              # Individual request
│   ├── get-by-id.json         # Individual request
│   └── admin/
│       └── create.json        # Nested request (subfolder)
├── auth/
│   ├── collection.json
│   ├── login.json
│   └── refresh-token.json
├── .env.development           # Environment variables
└── .env.production
```

### `collection.json`

```json
{
  "id": "users",
  "name": "Users API",
  "description": "User management endpoints",
  "updated": "2026-01-15T10:30:00.000Z"
}
```

### Request File (`list.json`)

```json
{
  "id": "list",
  "name": "List Users",
  "method": "GET",
  "url": "https://{{HOST}}/api/users",
  "headers": {
    "Authorization": "Bearer {{TOKEN}}",
    "Content-Type": "application/json"
  },
  "query": {
    "page": "1",
    "limit": "50"
  },
  "description": "Paginated list of users",
  "updated": "2026-01-15T10:30:00.000Z"
}
```

### Environment File (`.env.development`)

```
# Development environment
HOST=dev-api.example.com
TOKEN=dev-token-abc123
BASE_PATH=/v1

# Production environment (separate file)
# HOST=api.example.com
# TOKEN=prod-token-xyz789
# BASE_PATH=/v2
```

## VS Code File System Integration

The VS Code extension uses `vscode.workspace.fs` for all file operations, enabling:

- **Opening folders**: Select a folder via VS Code's native file picker.
- **Saving requests**: Write request files directly to the workspace using `vscode.workspace.fs.writeFile`.
- **Reading collections**: List and read collection metadata and request files via `vscode.workspace.fs.readDirectory` and `vscode.workspace.fs.readFile`.
- **Environment files**: Read and write `.env` files through the VS Code file system adapter.
- **File watching**: Use `vscode.workspace.createFileSystemWatcher` to detect external changes and auto-refresh.
- **Opening files**: Open request JSON files directly in the VS Code editor.

The `VsCodeFileSystem` class in `packages/vscode/src/vscode-fs.ts` provides a unified abstraction over VS Code's file system API, mirroring the core library's file operations while using the extension host's file system. This means the same collection format works identically in the desktop app, VS Code extension, and any other host.

## Converting the Core to a Plugin

The core library (`packages/core`) is designed to be framework-agnostic. Here's how to create a new plugin or host:

### Step 1: Import the browser-safe entry point

```typescript
import {
  interpolate,
  buildRequest,
  createHistoryStore,
  addToHistory,
  diff,
  formatDiffs,
  isErrorResponse,
  getHeader,
  parseResponseBody,
  searchHistory,
  replayEntry,
  type RequestFile,
  type RequestOptions,
  type Response,
  type ErrorResponse,
  type HistoryEntry,
  type DiffResult,
} from "@sentry-api/core/browser";
```

This gives you all the logic without Node.js dependencies (no `fs`, `path`, or `axios`).

### Step 2: Provide HTTP transport

The core library's `sendRequest()` uses Axios internally. In a browser environment, you need to either:

**Option A**: Use the core's `sendRequest()` directly if CORS allows it (rare for API clients).

**Option B**: Provide your own transport function that returns a `Response` or `ErrorResponse`:

```typescript
async function myFetchTransport(options: RequestOptions): Promise<Response | ErrorResponse> {
  const startTime = Date.now();
  try {
    const response = await fetch(options.url, {
      method: options.method,
      headers: options.headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await response.text();
    const headers: Record<string, string> = {};
    response.headers.forEach((v, k) => { headers[k] = v; });
    return {
      status: response.status,
      statusText: response.statusText,
      headers,
      data: parseResponseBody(text, response.headers.get("content-type") ?? undefined),
      duration: Date.now() - startTime,
      request: options,
    };
  } catch (error) {
    return {
      error: (error as Error).message,
      request: options,
      details: { duration: Date.now() - startTime },
    };
  }
}
```

### Step 3: Provide file system access

For file-based collections, provide your own file operations:

```typescript
async function myReadCollection(folderPath: string): Promise<Collection> {
  // Use your host's file system API
  const content = await myFileSystem.readFile(folderPath + "/collection.json");
  const metadata = JSON.parse(content);
  const requests = await myFileSystem.readRequestFiles(folderPath);
  return { ...metadata, requests };
}
```

### Step 4: Wire up the UI

Create your UI components using the types and data structures from the core library. The existing Tauri React components and VS Code webview HTML provide reference implementations.

### Architecture Overview

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

The core library handles all business logic (request building, environment interpolation, history management, response diffing, collection CRUD). The host layer provides transport (HTTP), file system access, and the UI. This separation means you can create a new plugin for any host by implementing just the transport and file system adapters.

## Testing

### Core Library Tests

```bash
cd packages/core && npx vitest run
```

7 test files, 100 tests covering:
- **HTTP client**: Request sending, error handling, timeout, status code handling
- **Request builder**: URL interpolation, header interpolation, query parameter interpolation, body interpolation, cURL export
- **Environment**: `.env` file parsing, `{{variable}}` interpolation, recursive object interpolation
- **Collections**: Read/write collections, one-file-per-request structure, nested folders, migration from monolithic format
- **History**: Create store, add entries, replay, search, filter by method/status, serialization/deserialization
- **Diff**: JSON diff for primitives, objects, arrays, nested structures, added/removed/changed detection
- **Results**: Error response detection, header lookup, body parsing

### VS Code Extension Tests

```bash
cd packages/vscode && npx vitest run
```

5 test files, 167 tests covering:
- **Webview**: Message handling (folder selection, request selection, request update, send request, history, env files, delete request, view history, diff with history)
- **History Panel**: Show, set history, search, select, replay, dispose
- **Diff Panel**: Show, set diff data, format output, dispose
- **Workspace Validation**: Command namespace isolation, multi-root workspace isolation, empty workspace handling, nested collections, special characters in paths, no conflict with existing extensions, workspace switching, large workspaces, corrupted files, environment file isolation, file system operation isolation, file watching, concurrent operations, special request IDs, binary-like data
- **Extension Lifecycle**: Command registration, activation/deactivation, namespace uniqueness, workspace isolation, manifest validation, error handling, resource cleanup, multi-instance support

### Integration Tests

```bash
node packages/app/tests/integration.test.mjs
```

End-to-end test covering the full request lifecycle in the Tauri app.

### Test Data Isolation

All tests create temporary files and databases in the OS temp folder (`/tmp` on Linux/macOS, `%TEMP%` on Windows) and clean them up after each test. No test data is committed to the repository.

## Linting and Formatting

```bash
npm run lint          # Lint all packages
npm run format        # Format all files with Prettier
```

## License

MIT
