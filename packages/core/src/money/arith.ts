/** Integer money arithmetic. No floats. */
import type { Rounding } from "./types";

export function toBig(minor: number, what = "amount"): bigint {
  if (!Number.isSafeInteger(minor)) {
    throw new RangeError(`${what} must be a whole number of minor units, got ${minor}`);
  }
  return BigInt(minor);
}

export function toSafe(v: bigint, what = "amount"): number {
  if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`${what} is too large to return as a safe integer: ${v}`);
  }
  return Number(v);
}

/** numerator / denominator, rounded to a multiple of `rounding.toMinor`. Denominator > 0. */
export function divideRounded(numerator: bigint, denominator: bigint, rounding: Rounding): bigint {
  if (denominator <= 0n) throw new RangeError("denominator must be positive");
  const unit = BigInt(rounding.toMinor);
  if (unit <= 0n) throw new RangeError("rounding unit must be positive");
  const d = denominator * unit;
  const neg = numerator < 0n;
  const n = neg ? -numerator : numerator;
  let q: bigint;
  switch (rounding.mode) {
    case "down":
      q = n / d;
      break;
    case "up":
      q = (n + d - 1n) / d;
      break;
    case "nearest":
      q = (2n * n + d) / (2n * d);
      break;
  }
  // Rounding is applied to the magnitude: "down" means towards zero.
  return (neg ? -q : q) * unit;
}

export function roundMinor(minor: bigint, rounding: Rounding): bigint {
  return divideRounded(minor, 1n, rounding);
}

export function sum(values: readonly bigint[]): bigint {
  return values.reduce((a, b) => a + b, 0n);
}

/** "18 %" from 1800 basis points; "1 %" from 100; "12.5 %" from 1250. */
export function bpText(bp: number): string {
  const whole = Math.trunc(bp / 100);
  const frac = Math.abs(bp % 100);
  return frac === 0
    ? `${whole} %`
    : `${whole}.${String(frac).padStart(2, "0").replace(/0$/, "")} %`;
}
