import { defineConfig } from "vitest/config";

// Creating and migrating a PGlite database (and Argon2 hashing) takes far longer
// than the 10 s default on a busy runner: the same limits as apps/app and ee/.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
