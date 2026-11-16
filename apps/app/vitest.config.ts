import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Business features: ee/ when it's there, else the free build (lib/ee.ts).
const eeIndex = fileURLToPath(new URL("../../ee/index.ts", import.meta.url));
const eeEntry =
  process.env.DUEPROOF_EE !== "off" && existsSync(eeIndex)
    ? eeIndex
    : fileURLToPath(new URL("./lib/ee-absent.ts", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@/": fileURLToPath(new URL("./", import.meta.url)),
      "@dueproof/ee-entry": eeEntry,
      // "server-only" throws outside React Server Components; tests run server code directly.
      "server-only": fileURLToPath(new URL("./test/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
