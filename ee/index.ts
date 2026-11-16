/**
 * Dueproof Business features. Proprietary: see ee/LICENSE.
 *
 * The app loads this module only if the ee/ directory is present (the
 * `@dueproof/ee-entry` alias in apps/app), and each feature here does
 * anything only while a valid licence lists it. Code outside ee/ never
 * imports this directory (AGENTS rule 12); it uses the interfaces in
 * @dueproof/plugins.
 */
import type { EePlugin } from "@dueproof/plugins";
import { auditExport } from "./audit-export/audit-export";
import { licence } from "./licence/licence";
import { ssoExtension } from "./sso/sso";
import { whiteLabel } from "./white-label/white-label";

export const ee: EePlugin | null = {
  licence,
  sso: ssoExtension,
  auditExport,
  whiteLabel,
};
