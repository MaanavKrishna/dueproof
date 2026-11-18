/**
 * The India country pack (central taxes only, D-prod-3). DATA, versioned,
 * read-only at run time. NOTHING HERE IS VERIFIED YET: every rule is
 * `verified: false` until a practising CA signs it off (D-prod-4).
 */
import type { StatutoryPack } from "../../types";
import { directTaxNotCovered, directTaxRules } from "./direct-tax";
import { gstNotCovered, gstRules, gstStateGroups } from "./gst";
import { rocNotCovered, rocRules } from "./roc";

export { IN_EXTENSIONS } from "./extensions";
export {
  inOrderWindowFor,
  type OrderWindowChoice,
  orderWindows as inOrderWindows,
} from "./windows";

export const IN_PACK: StatutoryPack = {
  country: "in",
  version: "in-2026.11.1-draft",
  asOf: "2026-11-18",
  fyStartMonth: 4,
  rules: [...gstRules, ...directTaxRules, ...rocRules],
  stateGroups: gstStateGroups,
  expectedForms: [
    { kind: "gst", match: { scheme: [null, "regular", "qrmp"] }, forms: ["GSTR-1", "GSTR-3B"] },
    { kind: "gst", match: { scheme: ["composition"] }, forms: ["CMP-08", "GSTR-4"] },
    { kind: "tds", forms: ["TDS payment (challan ITNS 281)"] },
    { kind: "income_tax", forms: ["ITR"] },
    { kind: "roc", forms: ["AOC-4", "MGT-7"] },
  ],
  notCovered: [...gstNotCovered, ...directTaxNotCovered, ...rocNotCovered],
};
