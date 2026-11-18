import type { MatchValue, Registration, StatutoryPack, StatutoryRule } from "./types";

const GSTIN_RX = /^(\d{2})[A-Z0-9]{13}$/i;

/**
 * The facts a registration exposes to rule matching:
 * frequency, scheme, stateCode, stateGroup, plus its own attributes.
 *
 * One fact is derived: a QRMP registration with no frequency recorded is
 * quarterly, because QRMP is the quarterly scheme (CGST Rules r.61A).
 */
export function registrationFacts(
  reg: Registration,
  pack: Pick<StatutoryPack, "stateGroups">,
): Record<string, MatchValue> {
  let stateCode: string | null = null;
  if (reg.state && /^\d{2}$/.test(reg.state)) stateCode = reg.state;
  else if (reg.kind === "gst" && reg.identifier)
    stateCode = GSTIN_RX.exec(reg.identifier)?.[1] ?? null;
  const facts: Record<string, MatchValue> = {
    frequency: reg.frequency ?? (reg.scheme === "qrmp" ? "quarterly" : null),
    scheme: reg.scheme ?? null,
    stateCode,
    stateGroup: stateCode ? (pack.stateGroups?.[stateCode] ?? null) : null,
  };
  // Attributes come last, so an explicit stateGroup wins over the derived one.
  for (const [k, v] of Object.entries(reg.attributes ?? {})) facts[k] = v;
  return facts;
}

/** Every listed field must have one of its listed values; `null` matches "not set". */
export function factsMatch(
  match: Readonly<Record<string, readonly MatchValue[]>> | undefined,
  facts: Readonly<Record<string, MatchValue>>,
): boolean {
  if (!match) return true;
  return Object.entries(match).every(([field, allowed]) => allowed.includes(facts[field] ?? null));
}

export function ruleApplies(
  rule: StatutoryRule,
  reg: Registration,
  facts: Record<string, MatchValue>,
): boolean {
  return rule.appliesTo.kind === reg.kind && factsMatch(rule.appliesTo.match, facts);
}
