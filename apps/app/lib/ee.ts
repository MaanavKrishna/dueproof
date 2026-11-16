/**
 * The one place the app reaches Business features (08 §1, AGENTS rule 12).
 *
 * `@dueproof/ee-entry` is an alias, not a package: it resolves to
 * `ee/index.ts` when the directory exists and to `./ee-absent.ts` when it
 * doesn't (next.config `turbopack.resolveAlias`, vitest `resolve.alias`;
 * types in ./ee-entry.d.ts). Nothing else in the app names `ee/`; everything goes
 * through the interfaces in `@dueproof/plugins`.
 *
 * Even with `ee/` present, a feature does something only while the licence
 * lists it (lib/licence.ts).
 */
import "server-only";
import { ee } from "@dueproof/ee-entry";
import type { EePlugin } from "@dueproof/plugins";

let override: EePlugin | null | undefined;

export function loadEe(): EePlugin | null {
  return override !== undefined ? override : ee;
}

/** Tests only: run as the free build (null) or with a given plugin. */
export function setEeForTests(plugin: EePlugin | null | undefined): void {
  override = plugin;
}
