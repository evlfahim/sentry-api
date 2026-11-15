# sentry-api

> A git-native API client with file-based collections, response diffing, and a modular core designed for instant VS Code plugin conversion.

Task: REST API client like Postman but local and file-based: collections stored as plain JSON in the repo, environments, request history and response diff; later a VS Code plugin #plugin #vscode #web

## Why it is better than what exists
- Git-friendly one-file-per-request structure enables clean diffs and conflict-free merges unlike Postman's monolithic JSON.
- Built-in response diffing catches breaking changes instantly, a feature missing in APITester and ApiForge.
- Modular core library allows seamless VS Code plugin integration without the overhead of Frap's standalone desktop architecture.
- Local-first execution ensures zero cloud dependency and full privacy, unlike cloud-synced alternatives.

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

## Becoming a plugin
Core logic resides in `packages/core` as a pure TypeScript library; the VS Code plugin in `packages/vscode` consumes this library, mapping VS Code APIs (workspace, window) to the core interface and rendering the UI via a webview.

## Steps
- [x] 1. Initialize monorepo with `packages/core`, `packages/app`, and `packages/vscode`; configure Vitest and verify core test suite runs.
- [x] 2. Implement HTTP client, environment parser, and request builder in core; write unit tests for URL interpolation and header handling.
- [x] 3. Add file system operations to core for reading/writing collections and one-file-per-request structure; test persistence and migration.
- [x] 4. Implement history management and response diffing logic in core; write tests for JSON diff algorithms and history replay.
- [ ] 5. Scaffold Tauri desktop app with sidebar, request editor, and response viewer; verify `cargo tauri dev` launches the UI.
- [ ] 6. Connect Tauri UI to core library; implement request sending, response display, and history population.
- [ ] 7. Add response diff view, cURL export, and environment switcher to the Tauri app; test file watching for external changes.
- [ ] 8. Polish Tauri UI with dark/light mode, error handling, and loading states; run integration tests on the desktop app.
- [ ] 9. Create VS Code extension manifest and stub in `packages/vscode`; verify extension activation and command registration.
- [ ] 10. Implement webview bridge in VS Code plugin to communicate with core library; test command execution via webview.
- [ ] 11. Integrate VS Code file system APIs with core library; enable opening folders and saving requests directly from the plugin.
- [ ] 12. Add history and diff features to the VS Code webview; test replay and diff rendering within the editor context.
- [ ] 13. Validate VS Code plugin functionality across different workspaces; ensure no conflicts with existing extensions.
- [ ] 14. Write comprehensive README with setup instructions, usage examples, and guide for converting the core to a plugin.
- [ ] 15. Run full lint, format, and build pipeline; verify all packages compile and tests pass.
