/**
 * `@dueproof/ee-entry` is a build-time alias (next.config.ts, vitest.config.ts):
 * `ee/index.ts` when the Business directory is present, `./ee-absent.ts`
 * otherwise. Both export this shape. Declaring it here, rather than pointing
 * TypeScript at ee/, keeps the app's typecheck the same with or without ee/
 * (ee/ typechecks itself: `pnpm --filter @dueproof/ee typecheck`).
 */
declare module "@dueproof/ee-entry" {
  import type { EePlugin } from "@dueproof/plugins";
  export const ee: EePlugin | null;
}
