import { defineConfig } from "vite";

// The local screens (first-launch setup, "Change server") are plain HTML and
// TypeScript, built to ../dist for Tauri's frontendDist. No framework: they
// are one form, and the shell's CSP allows only same-origin scripts and styles.
export default defineConfig({
  root: "ui",
  base: "./",
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: "127.0.0.1" },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: ["es2022", "safari16", "chrome110"],
    // Keep CSS as a file and never inline assets as data: URLs (CSP).
    assetsInlineLimit: 0,
    cssCodeSplit: false,
  },
});
