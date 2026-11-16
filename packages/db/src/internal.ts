/**
 * Raw database access for packages/auth (Better Auth's adapter reads its own
 * tables across organisations) and for tooling. Feature code must not import
 * this: use `withOrg()` from "@dueproof/db".
 */
export { type AnyPgDatabase, type Tx, unsafeRawDb } from "./client";
