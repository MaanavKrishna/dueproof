import { defineConfig } from "drizzle-kit";

/**
 * SQL migrations for every driver (Neon, Postgres, PGlite).
 * Row-level security and append-only triggers live in migrations/rls.sql,
 * which `migrate()` applies after these (it is idempotent).
 */
export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/schema.ts", "./src/auth-schema.ts"],
  out: "./migrations",
  strict: true,
  verbose: true,
});
