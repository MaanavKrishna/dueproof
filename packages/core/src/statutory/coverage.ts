/**
 * What the statutory calendar does NOT cover for a registration, so a
 * missing return is visible instead of silently absent (03 §8a). A calendar
 * that shows some returns for a registration reads as complete; these notes
 * say where it is not.
 *
 * - `no_rule`: the registration should file a form (the pack's
 *   `expectedForms`) but no rule fits its facts, e.g. a GST registration
 *   marked "monthly" under the QRMP scheme, or a QRMP state group the pack
 *   does not know. Also a registration that no rule fits at all.
 * - `not_covered`: an obligation the pack knows about but does not generate
 *   (the pack's `notCovered` markers), e.g. PMT-06 for a QRMP filer.
 */
import { factsMatch, registrationFacts, ruleApplies } from "./match";
import { IN_PACK } from "./packs/in";
import type { CoverageNote, MatchValue, Registration, StatutoryPack } from "./types";

function describeFacts(facts: Record<string, MatchValue>, fields: readonly string[]): string {
  return fields
    .map((f) => {
      const v = facts[f];
      return `${f} ${v === null || v === undefined ? "not recorded" : `"${String(v)}"`}`;
    })
    .join(", ");
}

export function statutoryCoverage(
  registrations: readonly Registration[],
  pack: StatutoryPack = IN_PACK,
): CoverageNote[] {
  const notes: CoverageNote[] = [];
  for (const reg of registrations) {
    const facts = registrationFacts(reg, pack);
    const applicable = pack.rules.filter((r) => ruleApplies(r, reg, facts));
    const forms = new Set(applicable.map((r) => r.form));
    let expected = false;
    for (const e of pack.expectedForms ?? []) {
      if (e.kind !== reg.kind || !factsMatch(e.match, facts)) continue;
      expected = true;
      for (const form of e.forms) {
        if (forms.has(form)) continue;
        const fields = [
          ...new Set(
            pack.rules
              .filter((r) => r.form === form && r.appliesTo.kind === reg.kind)
              .flatMap((r) => Object.keys(r.appliesTo.match ?? {})),
          ),
        ];
        notes.push({
          registrationId: reg.id,
          type: "no_rule",
          form,
          title: `${form} is not on the calendar`,
          reason: `No ${form} rule fits this registration (${describeFacts(facts, fields)}). Check the registration's details; until then, add ${form} by hand.`,
        });
      }
    }
    if (!expected && applicable.length === 0) {
      notes.push({
        registrationId: reg.id,
        type: "no_rule",
        form: "",
        title: "Nothing on the calendar for this registration",
        reason: `No rule in the ${pack.version} pack fits this registration (${describeFacts(facts, ["frequency", "scheme"])}). Add its returns by hand.`,
      });
    }
    for (const m of pack.notCovered ?? []) {
      if (m.appliesTo.kind !== reg.kind || !factsMatch(m.appliesTo.match, facts)) continue;
      notes.push({
        registrationId: reg.id,
        type: "not_covered",
        form: m.form,
        title: m.title,
        reason: m.reason,
        source: m.source,
      });
    }
  }
  return notes;
}
