/**
 * Format checks for Indian registration numbers, for display ("format looks
 * right" / "check this number"). They check the shape and, for GSTIN, the
 * check digit; they don't prove a registration exists.
 */
export type IdentifierType = "GSTIN" | "PAN" | "CIN" | "TAN" | "LLPIN";

export interface IdentifierCheck {
  valid: boolean;
  /** Why it looks wrong, in plain words. */
  reason?: string;
}

const CODES = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** GSTIN check character (the published mod-36 algorithm). */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CODES.indexOf(first14[i] ?? "");
    const factor = i % 2 === 0 ? 1 : 2;
    const product = v * factor;
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CODES[(36 - (sum % 36)) % 36] ?? "";
}

const PAN_RX = /^[A-Z]{3}[ABCFGHJLPT][A-Z]\d{4}[A-Z]$/;

export function checkIdentifier(type: IdentifierType, raw: string): IdentifierCheck {
  const value = raw.trim().toUpperCase();
  switch (type) {
    case "PAN":
      if (value.length !== 10) return { valid: false, reason: "A PAN has 10 characters" };
      if (!PAN_RX.test(value)) return { valid: false, reason: "Should look like AAAPA1234A" };
      return { valid: true };
    case "GSTIN": {
      if (value.length !== 15) return { valid: false, reason: "A GSTIN has 15 characters" };
      if (!/^\d{2}[A-Z0-9]{13}$/.test(value))
        return { valid: false, reason: "Should start with a two-digit state code" };
      const state = Number(value.slice(0, 2));
      if (state < 1 || state > 38) return { valid: false, reason: "Unknown state code" };
      if (!PAN_RX.test(value.slice(2, 12)))
        return { valid: false, reason: "Characters 3–12 should be a PAN" };
      if (value[13] !== "Z") return { valid: false, reason: "The 14th character is normally Z" };
      if (gstinCheckChar(value.slice(0, 14)) !== value[14])
        return { valid: false, reason: "The check digit doesn't match" };
      return { valid: true };
    }
    case "TAN":
      if (!/^[A-Z]{4}\d{5}[A-Z]$/.test(value))
        return { valid: false, reason: "Should look like DELA12345B" };
      return { valid: true };
    case "CIN":
      if (!/^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/.test(value))
        return { valid: false, reason: "Should look like U15400MH2012PTC123456" };
      return { valid: true };
    case "LLPIN":
      if (!/^[A-Z]{3}-\d{4}$/.test(value))
        return { valid: false, reason: "Should look like AAB-1234" };
      return { valid: true };
  }
}
