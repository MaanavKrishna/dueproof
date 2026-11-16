import { defineConfig } from "vitest/config";

// PGlite and Argon2 make the SSO round trip slow on a busy CI runner; the
// same limits as apps/app.
export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
