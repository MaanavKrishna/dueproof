/**
 * Indian registration numbers as value objects: normalise and check the
 * format (and, for a GSTIN, its check character). A valid format does not
 * prove a registration exists. Pure: used by client import, the client page
 * and anywhere a GSTIN or PAN is typed.
 */

export type IdentifierKind = "gstin" | "pan" | "tan" | "cin";

export interface IdentifierResult {
  ok: boolean;
  /** Upper-cased, spaces removed. */
  value: string;
  /** Why it looks wrong, in plain words. */
  reason?: string;
}

const CODES = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const PAN_RX = /^[A-Z]{3}[ABCFGHJLPT][A-Z]\d{4}[A-Z]$/;

/** Upper-case and drop spaces and hyphens people paste in. */
export function normaliseIdentifier(raw: string): string {
  return raw.replace(/[\s-]+/g, "").toUpperCase();
}

/** The GSTIN check character for the first 14 characters (the published mod-36 algorithm). */
export function gstinCheckCharacter(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CODES.indexOf(first14[i] ?? "");
    if (v < 0) return "";
    const product = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CODES[(36 - (sum % 36)) % 36] ?? "";
}

export function checkPan(raw: string): IdentifierResult {
  const value = normaliseIdentifier(raw);
  if (value.length !== 10) return { ok: false, value, reason: "A PAN has 10 characters." };
  if (!PAN_RX.test(value)) return { ok: false, value, reason: "A PAN looks like AAAPA1234A." };
  return { ok: true, value };
}

export function checkGstin(raw: string): IdentifierResult {
  const value = normaliseIdentifier(raw);
  if (value.length !== 15) return { ok: false, value, reason: "A GSTIN has 15 characters." };
  if (!/^\d{2}[A-Z0-9]{13}$/.test(value))
    return { ok: false, value, reason: "A GSTIN starts with a two-digit state code." };
  const state = Number(value.slice(0, 2));
  if (state < 1 || state > 38) return { ok: false, value, reason: "Unknown state code." };
  if (!PAN_RX.test(value.slice(2, 12)))
    return { ok: false, value, reason: "Characters 3 to 12 of a GSTIN are a PAN." };
  if (gstinCheckCharacter(value.slice(0, 14)) !== value[14])
    return { ok: false, value, reason: "The GSTIN's check character doesn't match." };
  return { ok: true, value };
}

export function checkTan(raw: string): IdentifierResult {
  const value = normaliseIdentifier(raw);
  if (!/^[A-Z]{4}\d{5}[A-Z]$/.test(value))
    return { ok: false, value, reason: "A TAN looks like DELA12345B." };
  return { ok: true, value };
}

export function checkCin(raw: string): IdentifierResult {
  const value = normaliseIdentifier(raw);
  if (!/^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/.test(value))
    return { ok: false, value, reason: "A CIN looks like U15400MH2012PTC123456." };
  return { ok: true, value };
}

export function checkIdentifierOf(kind: IdentifierKind, raw: string): IdentifierResult {
  switch (kind) {
    case "gstin":
      return checkGstin(raw);
    case "pan":
      return checkPan(raw);
    case "tan":
      return checkTan(raw);
    case "cin":
      return checkCin(raw);
  }
}

/** The PAN inside a GSTIN (characters 3 to 12). */
export function panOfGstin(gstin: string): string {
  return normaliseIdentifier(gstin).slice(2, 12);
}

/** The state code of a GSTIN ("27" is Maharashtra). */
export function stateCodeOfGstin(gstin: string): string {
  return normaliseIdentifier(gstin).slice(0, 2);
}
