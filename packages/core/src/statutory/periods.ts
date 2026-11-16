/**
 * Period strings for statutory obligations.
 *
 *   month          "2026-10"
 *   quarter        "FY2026-27-Q1"   (FY quarters; Q1 = first three months of the FY)
 *                  "2026-Q3"        accepted on input as a *calendar* quarter (Jul–Sep 2026)
 *                                   and normalised to "FY2026-27-Q2" for an April FY
 *   fy             "FY2025-26"      ("FY2026" when the FY starts in January)
 *   fy_instalment  "FY2026-27-I1"
 */
import { formatMonth, fyLabel } from "@dueproof/i18n";
import { compareIso, dayOfMonth, lastDayOfMonth, parseIso } from "../dates/calendar";
import type { ParsedPeriod, PeriodType } from "./types";

const MONTH_RX = /^(\d{4})-(\d{2})$/;
const FY_RX = /^FY(\d{4})(?:-(\d{2}))?$/;
const FY_Q_RX = /^FY(\d{4})(?:-(\d{2}))?-Q([1-4])$/;
const CAL_Q_RX = /^(\d{4})-Q([1-4])$/;
const FY_I_RX = /^FY(\d{4})(?:-(\d{2}))?-I([1-9])$/;

export function fyCode(fyStart: number, fyStartMonth: number): string {
  if (fyStartMonth === 1) return `FY${fyStart}`;
  return `FY${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")}`;
}

function checkFySuffix(start: number, suffix: string | undefined, fyStartMonth: number): boolean {
  if (fyStartMonth === 1) return suffix === undefined;
  return suffix === String((start + 1) % 100).padStart(2, "0");
}

/** [year, month] of the n-th month (0-based) after the FY start. */
function fyMonth(fyStart: number, fyStartMonth: number, offset: number): [number, number] {
  const index = fyStart * 12 + (fyStartMonth - 1) + offset;
  return [Math.floor(index / 12), (index % 12) + 1];
}

function fyStartOf(year: number, month: number, fyStartMonth: number): number {
  return month >= fyStartMonth ? year : year - 1;
}

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function quarter(fyStart: number, q: number, fyStartMonth: number): ParsedPeriod {
  const [sy, sm] = fyMonth(fyStart, fyStartMonth, (q - 1) * 3);
  const [ey, em] = fyMonth(fyStart, fyStartMonth, (q - 1) * 3 + 2);
  const span =
    sy === ey
      ? `${SHORT[sm - 1]}–${SHORT[em - 1]} ${ey}`
      : `${SHORT[sm - 1]} ${sy}–${SHORT[em - 1]} ${ey}`;
  return {
    type: "quarter",
    canonical: `${fyCode(fyStart, fyStartMonth)}-Q${q}`,
    start: dayOfMonth(sy, sm, 1),
    end: lastDayOfMonth(ey, em),
    fyStart,
    index: q,
    label: `Q${q} ${fyLabel(fyStart, { startMonth: fyStartMonth })} (${span})`,
  };
}

function fy(fyStart: number, fyStartMonth: number): ParsedPeriod {
  const [ey, em] = fyMonth(fyStart, fyStartMonth, 11);
  return {
    type: "fy",
    canonical: fyCode(fyStart, fyStartMonth),
    start: dayOfMonth(fyStart, fyStartMonth, 1),
    end: lastDayOfMonth(ey, em),
    fyStart,
    label: fyLabel(fyStart, { startMonth: fyStartMonth }),
  };
}

/**
 * Parse a period string of the given type. Returns null if it is malformed
 * or of a different type.
 */
export function parsePeriod(
  period: string,
  type: PeriodType,
  fyStartMonth: number,
): ParsedPeriod | null {
  switch (type) {
    case "month": {
      const m = MONTH_RX.exec(period);
      if (!m) return null;
      const year = Number(m[1]);
      const month = Number(m[2]);
      if (month < 1 || month > 12) return null;
      return {
        type,
        canonical: period,
        start: dayOfMonth(year, month, 1),
        end: lastDayOfMonth(year, month),
        fyStart: fyStartOf(year, month, fyStartMonth),
        label: formatMonth(year, month),
      };
    }
    case "quarter": {
      let m = FY_Q_RX.exec(period);
      if (m) {
        const start = Number(m[1]);
        if (!checkFySuffix(start, m[2], fyStartMonth)) return null;
        return quarter(start, Number(m[3]), fyStartMonth);
      }
      m = CAL_Q_RX.exec(period);
      if (!m) return null;
      // Calendar quarter → FY quarter; only possible when FY quarters align with calendar ones.
      if ((fyStartMonth - 1) % 3 !== 0) return null;
      const year = Number(m[1]);
      const firstMonth = (Number(m[2]) - 1) * 3 + 1;
      const start = fyStartOf(year, firstMonth, fyStartMonth);
      const offset = (year * 12 + firstMonth - 1 - (start * 12 + fyStartMonth - 1)) / 3;
      return quarter(start, offset + 1, fyStartMonth);
    }
    case "fy": {
      const m = FY_RX.exec(period);
      if (!m) return null;
      const start = Number(m[1]);
      if (!checkFySuffix(start, m[2], fyStartMonth)) return null;
      return fy(start, fyStartMonth);
    }
    case "fy_instalment": {
      const m = FY_I_RX.exec(period);
      if (!m) return null;
      const start = Number(m[1]);
      if (!checkFySuffix(start, m[2], fyStartMonth)) return null;
      const base = fy(start, fyStartMonth);
      const n = Number(m[3]);
      return {
        ...base,
        type,
        canonical: `${base.canonical}-I${n}`,
        index: n,
        label: `Instalment ${n}, ${base.label}`,
      };
    }
  }
}

/**
 * Every period of `type` whose start falls within [from, to]. For
 * instalments, `instalments` periods per FY.
 */
export function periodsStartingBetween(
  type: PeriodType,
  from: string,
  to: string,
  fyStartMonth: number,
  instalments = 4,
): ParsedPeriod[] {
  const out: ParsedPeriod[] = [];
  const f = parseIso(from);
  const t = parseIso(to);
  const firstFy = fyStartOf(f.year, f.month, fyStartMonth);
  const lastFy = fyStartOf(t.year, t.month, fyStartMonth);
  const inRange = (p: ParsedPeriod) =>
    compareIso(p.start, from) >= 0 && compareIso(p.start, to) <= 0;
  for (let y = firstFy; y <= lastFy; y++) {
    const candidates: (ParsedPeriod | null)[] = [];
    if (type === "month") {
      for (let i = 0; i < 12; i++) {
        const [yy, mm] = fyMonth(y, fyStartMonth, i);
        candidates.push(parsePeriod(`${yy}-${String(mm).padStart(2, "0")}`, "month", fyStartMonth));
      }
    } else if (type === "quarter") {
      for (let q = 1; q <= 4; q++) candidates.push(quarter(y, q, fyStartMonth));
    } else if (type === "fy") {
      candidates.push(fy(y, fyStartMonth));
    } else {
      for (let i = 1; i <= instalments; i++) {
        candidates.push(
          parsePeriod(`${fyCode(y, fyStartMonth)}-I${i}`, "fy_instalment", fyStartMonth),
        );
      }
    }
    // Instalment periods share their FY's start date, so all of an FY's instalments go together.
    for (const p of candidates) if (p && inRange(p)) out.push(p);
  }
  return out;
}
