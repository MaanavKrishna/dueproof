/**
 * India — government extensions of statutory due dates. DATA ONLY.
 *
 * When CBIC or CBDT extends a due date, add one entry here and release a
 * new pack version. The calendar applies it to every client whose
 * registration matches, keeps the original date beside it, and says
 * "Extended from … to … by <source>". Nothing else changes.
 *
 * Format (see `Extension` in ../../types.ts):
 *
 *   {
 *     ruleKey: "in.gst.gstr3b.monthly",      // a rule key in this pack
 *     period: "2026-10",                     // the period, as the rule writes it
 *     newDueOn: "2026-11-25",
 *     source: "Notification 12/2026-Central Tax dated 18 Nov 2026",  // the notification or circular itself
 *     announcedOn: "2026-11-18",
 *     where: { stateCode: ["32", "33"] },    // optional: only these registrations
 *   }
 *
 * Rules for an entry:
 * - Cite the notification, circular or press release by number and date;
 *   never "news reports". A press release is enough only until the
 *   notification issues: replace the source then.
 * - One entry per rule and period. A form with several rules (QRMP state
 *   groups A and B) needs one entry per rule.
 * - The latest `announcedOn` wins when two entries cover the same item.
 * - Entries are checked by a CA like every other value (house rule 10);
 *   the hygiene test checks the shape.
 *
 * Empty for now: no extension affects a due date in the current window.
 */
import type { Extension } from "../../types";

export const IN_EXTENSIONS: readonly Extension[] = [];
