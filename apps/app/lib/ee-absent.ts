/**
 * What `@dueproof/ee-entry` resolves to when the `ee/` directory isn't there
 * (or `DUEPROOF_EE=off`): no Business features. The free build compiles and
 * runs with this alone. See apps/app/lib/ee.ts.
 */
import type { EePlugin } from "@dueproof/plugins";

export const ee: EePlugin | null = null;
