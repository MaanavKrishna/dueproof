/**
 * The India country pack (central taxes only, D-prod-3). DATA, versioned,
 * read-only at run time. NOTHING HERE IS VERIFIED YET: every rule is
 * `verified: false` until a practising CA signs it off (D-prod-4).
 */
import type { StatutoryPack } from "../../types";
import { directTaxRules } from "./direct-tax";
import { gstRules, gstStateGroups } from "./gst";
import { rocRules } from "./roc";

export { orderWindows as inOrderWindows } from "./windows";

export const IN_PACK: StatutoryPack = {
  country: "in",
  version: "in-2026.11.0-draft",
  asOf: "2026-11-16",
  fyStartMonth: 4,
  rules: [...gstRules, ...directTaxRules, ...rocRules],
  stateGroups: gstStateGroups,
};
