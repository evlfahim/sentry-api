/**
 * Integration tests for the Tauri desktop app.
 *
 * These tests verify the full build pipeline: TypeScript compilation,
 * Vite bundling, and Rust compilation. They also verify that the
 * core library exports used by the UI are correct.
 *
 * Run: node tests/integration.test.mjs
 */
import { execSync } from "child_process";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..", "..", "..");

let failures = 0;
let passed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failures++;
  }
}

function assertFileExists(path, message) {
  assert(existsSync(path), message);
}

function assertContains(content, substring, message) {
  assert(content.includes(substring), message);
}

function assertNotContains(content, substring, message) {
  assert(!content.includes(substring), message);
}

function runCommand(cmd, cwd, message) {
  try {
    const output = execSync(cmd, { cwd, encoding: "utf8", stdio: "pipe" });
    console.log(`  ✓ ${message}`);
    passed++;
    return output;
  } catch (err) {
    console.error(`  ✗ ${message}`);
    console.error(`    ${err.stderr?.toString().trim().split("\n")[0] || err.message}`);
    failures++;
    return null;
  }
}

console.log("\n=== Sentry API Desktop App Integration Tests ===\n");

// ─── 1. Core library exports ───────────────────────────────────────

console.log("1. Core library browser exports");

const coreBrowserPath = join(rootDir, "packages/core/src/browser.ts");
assertFileExists(coreBrowserPath, "browser.ts exists");

const coreBrowserContent = readFileSync(coreBrowserPath, "utf8");
assertContains(coreBrowserContent, 'export * from "./types"', "exports types");
assertContains(coreBrowserContent, 'export * from "./env-core"', "exports env-core");
assertContains(coreBrowserContent, 'export * from "./request-builder"', "exports request-builder");
assertContains(coreBrowserContent, 'export * from "./history"', "exports history");
assertContains(coreBrowserContent, 'export * from "./diff"', "exports diff");
assertContains(coreBrowserContent, 'export * from "./results"', "exports results");

// Verify no Node imports in browser entry
assertNotContains(coreBrowserContent, "import fs", "no fs import in browser entry");
assertNotContains(coreBrowserContent, "import path", "no path import in browser entry");
assertNotContains(coreBrowserContent, "import axios", "no axios import in browser entry");

// ─── 2. Core package.json exports ──────────────────────────────────

console.log("\n2. Core package.json exports");

const corePkgPath = join(rootDir, "packages/core/package.json");
assertFileExists(corePkgPath, "core package.json exists");

const corePkg = JSON.parse(readFileSync(corePkgPath, "utf8"));
assert(corePkg.exports, "has exports field");
assert(corePkg.exports["."] !== undefined, "exports '.' entry");
assert(corePkg.exports["./browser"] !== undefined, "exports './browser' entry");

// ─── 3. TypeScript compilation ─────────────────────────────────────

console.log("\n3. TypeScript compilation");

const tscOutput = runCommand(
  "npx tsc --noEmit",
  join(rootDir, "packages/app"),
  "App TypeScript compiles"
);

// Check for specific UI components
const appPath = join(rootDir, "packages/app/src/App.tsx");
assertFileExists(appPath, "App.tsx exists");
const appContent = readFileSync(appPath, "utf8");
assertContains(appContent, "ToastContainer", "App uses ToastContainer");
assertContains(appContent, "darkMode", "App has dark mode state");
assertContains(appContent, "Ctrl+Enter", "App shows keyboard shortcut hint");
assertContains(appContent, "loading", "App has loading state");

// ─── 4. UI component files ─────────────────────────────────────────

console.log("\n4. UI component files");

const components = [
  "RequestEditor.tsx",
  "ResponseViewer.tsx",
  "Sidebar.tsx",
  "EnvironmentSwitcher.tsx",
  "Toast.tsx",
];

for (const comp of components) {
  const compPath = join(rootDir, "packages/app/src/components", comp);
  assertFileExists(compPath, `${comp} exists`);
}

// Check RequestEditor has loading overlay
const editorPath = join(rootDir, "packages/app/src/components/RequestEditor.tsx");
const editorContent = readFileSync(editorPath, "utf8");
assertContains(editorContent, "loading", "RequestEditor has loading prop");
assertContains(editorContent, "spinner", "RequestEditor has spinner animation");
assertContains(editorContent, "Ctrl+Enter", "RequestEditor has keyboard shortcut");
assertContains(editorContent, "sendError", "RequestEditor has send error state");

// Check ResponseViewer has skeleton loading
const viewerPath = join(rootDir, "packages/app/src/components/ResponseViewer.tsx");
const viewerContent = readFileSync(viewerPath, "utf8");
assertContains(viewerContent, "skeleton", "ResponseViewer has skeleton loading");
assertContains(viewerContent, "Diff", "ResponseViewer has Diff tab");
assertContains(viewerContent, "Preview", "ResponseViewer has Preview tab");

// Check Toast component
const toastPath = join(rootDir, "packages/app/src/components/Toast.tsx");
const toastContent = readFileSync(toastPath, "utf8");
assertContains(toastContent, "info", "Toast has info type");
assertContains(toastContent, "error", "Toast has error type");
assertContains(toastContent, "success", "Toast has success type");
assertContains(toastContent, "warning", "Toast has warning type");
assertContains(toastContent, "toast-enter", "Toast uses toast-enter CSS class");

// Check Sidebar has relative time formatting
const sidebarPath = join(rootDir, "packages/app/src/components/Sidebar.tsx");
const sidebarContent = readFileSync(sidebarPath, "utf8");
assertContains(sidebarContent, "formatRelativeTime", "Sidebar has relative time");
assertContains(sidebarContent, "just now", "Sidebar shows 'just now'");
assertContains(sidebarContent, "m ago", "Sidebar shows minutes ago");
assertContains(sidebarContent, "h ago", "Sidebar shows hours ago");

// Check EnvironmentSwitcher uses useEffect
const envPath = join(rootDir, "packages/app/src/components/EnvironmentSwitcher.tsx");
const envContent = readFileSync(envPath, "utf8");
assertContains(envContent, "useEffect", "EnvironmentSwitcher uses useEffect");
assertNotContains(envContent, "useState(() => {", "EnvironmentSwitcher doesn't misuse useState");

// ─── 5. CSS / Tailwind ─────────────────────────────────────────────

console.log("\n5. CSS and Tailwind configuration");

const cssPath = join(rootDir, "packages/app/src/index.css");
assertFileExists(cssPath, "index.css exists");
const cssContent = readFileSync(cssPath, "utf8");
assertContains(cssContent, "@tailwind base", "Tailwind base directive");
assertContains(cssContent, "@tailwind components", "Tailwind components directive");
assertContains(cssContent, "@tailwind utilities", "Tailwind utilities directive");
assertContains(cssContent, "html.dark body", "Dark mode background defined in CSS");
assertContains(cssContent, "spinner", "Spinner animation defined");
assertContains(cssContent, "skeleton", "Skeleton animation defined");
assertContains(cssContent, "slideIn", "Toast slide-in animation");
assertContains(cssContent, "pulse", "Pulse animation defined");

const tailwindPath = join(rootDir, "packages/app/tailwind.config.js");
assertFileExists(tailwindPath, "tailwind.config.js exists");
const tailwindContent = readFileSync(tailwindPath, "utf8");
assertContains(tailwindContent, "darkMode", "Tailwind has darkMode config");
assertContains(tailwindContent, "class", "Tailwind uses class-based dark mode");

// ─── 6. API bridge ─────────────────────────────────────────────────

console.log("\n6. API bridge (lib/api.ts)");

const apiPath = join(rootDir, "packages/app/src/lib/api.ts");
assertFileExists(apiPath, "api.ts exists");
const apiContent = readFileSync(apiPath, "utf8");
assertContains(apiContent, "send_http_request", "API has send_http_request");
assertContains(apiContent, "list_collections", "API has list_collections");
assertContains(apiContent, "load_history", "API has load_history");
assertContains(apiContent, "save_history", "API has save_history");
assertContains(apiContent, "list_env_files", "API has list_env_files");
assertContains(apiContent, "read_env_file", "API has read_env_file");
assertContains(apiContent, "watch_collections", "API has watch_collections");
assertContains(apiContent, "export_curl", "API has export_curl");
assertContains(apiContent, "errorMessage", "API exports errorMessage");

// ─── 7. Vite build ─────────────────────────────────────────────────

console.log("\n7. Vite build");

const buildOutput = runCommand(
  "npx vite build",
  join(rootDir, "packages/app"),
  "Vite builds successfully"
);

// Check build output
const distPath = join(rootDir, "packages/app/dist");
assertFileExists(distPath, "dist/ directory exists after build");

if (existsSync(distPath)) {
  const distFiles = readdirSync(distPath);
  assert(distFiles.includes("index.html"), "dist has index.html");
  const assetsPath = join(distPath, "assets");
  if (existsSync(assetsPath)) {
    const assetsFiles = readdirSync(assetsPath);
    assert(assetsFiles.some(f => f.endsWith(".js")), "dist/assets has JS files");
    assert(assetsFiles.some(f => f.endsWith(".css")), "dist/assets has CSS files");
  }
}

// ─── 8. Rust compilation ──────────────────────────────────────────

console.log("\n8. Rust compilation");

const cargoCheck = runCommand(
  "cargo check",
  join(rootDir, "packages/app/src-tauri"),
  "Rust compiles (cargo check)"
);

// Check Cargo.toml has required dependencies
const cargoTomlPath = join(rootDir, "packages/app/src-tauri/Cargo.toml");
assertFileExists(cargoTomlPath, "Cargo.toml exists");
const cargoTomlContent = readFileSync(cargoTomlPath, "utf8");
assertContains(cargoTomlContent, "reqwest", "Cargo.toml has reqwest");
assertContains(cargoTomlContent, "notify", "Cargo.toml has notify");
assertContains(cargoTomlContent, "tauri-plugin-dialog", "Cargo.toml has tauri-plugin-dialog");

// Check lib.rs has all commands
const libRsPath = join(rootDir, "packages/app/src-tauri/src/lib.rs");
assertFileExists(libRsPath, "lib.rs exists");
const libRsContent = readFileSync(libRsPath, "utf8");
assertContains(libRsContent, "send_http_request", "lib.rs has send_http_request");
assertContains(libRsContent, "list_collections", "lib.rs has list_collections");
assertContains(libRsContent, "load_history", "lib.rs has load_history");
assertContains(libRsContent, "save_history", "lib.rs has save_history");
assertContains(libRsContent, "list_env_files", "lib.rs has list_env_files");
assertContains(libRsContent, "read_env_file", "lib.rs has read_env_file");
assertContains(libRsContent, "watch_collections", "lib.rs has watch_collections");
assertContains(libRsContent, "export_curl", "lib.rs has export_curl");

// ─── 9. Rust tests ────────────────────────────────────────────────

console.log("\n9. Rust tests");

const rustTestOutput = runCommand(
  "cargo test",
  join(rootDir, "packages/app/src-tauri"),
  "Rust tests pass"
);

// ─── 10. Core tests ────────────────────────────────────────────────

console.log("\n10. Core tests");

const coreTestOutput = runCommand(
  "npx vitest run",
  join(rootDir, "packages/core"),
  "Core tests pass"
);

// ─── Summary ───────────────────────────────────────────────────────

console.log("\n=== Summary ===");
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failures}`);
console.log(`  Total:  ${passed + failures}`);

if (failures > 0) {
  console.error("\n❌ Integration tests FAILED");
  process.exit(1);
} else {
  console.log("\n✅ All integration tests PASSED");
  process.exit(0);
}
