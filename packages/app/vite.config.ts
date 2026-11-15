import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Keep Rust compiler output visible when run via `tauri dev`
  clearScreen: false,
  // Vite dev server port for Tauri to proxy to (tauri.conf.json devUrl)
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Cargo output and Rust sources are rebuilt by the Tauri CLI, not Vite
      ignored: ["**/target/**", "**/src-tauri/**", "**/gen/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    // tauri.conf.json frontendDist
    outDir: "dist",
    emptyOutDir: true,
  },
});
