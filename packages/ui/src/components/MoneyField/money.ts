/**
 * Money is integer paise everywhere. These helpers convert between paise and
 * the rupee text a person types, without floating-point arithmetic.
 */

const grouping = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Keep digits and one decimal point, with at most `decimals` digits after it. */
export function sanitiseRupeeInput(text: string, decimals = 2): string {
  let out = "";
  let seenDot = false;
  let fraction = 0;
  for (const ch of text) {
    if (ch >= "0" && ch <= "9") {
      if (seenDot) {
        if (fraction >= decimals) continue;
        fraction += 1;
      }
      out += ch;
    } else if (ch === "." && !seenDot && decimals > 0) {
      seenDot = true;
      out += ".";
    }
  }
  // Drop leading zeros ("007" → "7") but keep "0" and "0.5".
  return out.replace(/^0+(?=\d)/, "");
}

/** "4,52,300.5" or "452300.50" → 45230050. Empty → null. */
export function rupeesToPaise(text: string): number | null {
  const clean = sanitiseRupeeInput(text.replace(/[₹,\s]/g, ""));
  if (clean === "" || clean === ".") return null;
  const [whole = "", frac = ""] = clean.split(".");
  const rupees = whole === "" ? 0 : Number(whole);
  const paise = Number(frac.padEnd(2, "0").slice(0, 2));
  return rupees * 100 + paise;
}

/** 45230050 → "4,52,300.50"; 45230000 → "4,52,300" (paise shown only when non-zero, or when `alwaysPaise`). */
export function formatPaise(paise: number, opts: { alwaysPaise?: boolean } = {}): string {
  const negative = paise < 0;
  const abs = Math.abs(Math.trunc(paise));
  const rupees = Math.floor(abs / 100);
  const rest = abs % 100;
  const body = grouping.format(rupees);
  const frac = rest || opts.alwaysPaise ? `.${String(rest).padStart(2, "0")}` : "";
  return `${negative ? "-" : ""}${body}${frac}`;
}

/** The plain editing form of an amount: 45230050 → "452300.5", 45230000 → "452300". */
export function paiseToEditable(paise: number): string {
  const rupees = Math.floor(Math.abs(paise) / 100);
  const rest = Math.abs(paise) % 100;
  if (!rest) return String(rupees);
  return `${rupees}.${String(rest).padStart(2, "0").replace(/0$/, "")}`;
}
