import type { DateRule } from "@dueproof/contracts";
import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  addWorkingDays,
  daysInMonth,
  diffDays,
  dueBucket,
  isDateError,
  isLeapYear,
  isoWeekday,
  isValidIsoDate,
  MAX_PERIOD,
  type ResolvedDateDetail,
  resolveDate,
} from "../index";
import golden from "./fixtures/relative-dates.json";
import type { DateContext } from "./types";

interface Want {
  dueOn?: string;
  windowEndOn?: string;
  originalDueOn?: string;
  basis?: string;
  windowBasis?: string;
  adjustments?: string[];
  warnings?: string[];
  adjustmentsMatch?: string[];
  warningsMatch?: string[];
  error?: string;
  anchor?: string;
}
interface Case {
  name: string;
  rule: unknown;
  anchors: Record<string, string>;
  workingDays?: number[];
  holidays?: string[];
  rollForward?: boolean;
  want: Want;
  demo?: { dueOn: string | null; agrees: boolean; note?: string };
}

const MON_SAT = [1, 2, 3, 4, 5, 6];

function ctxFor(c: Case): DateContext {
  return {
    anchors: c.anchors,
    holidays: c.holidays ?? [],
    workingDays: c.workingDays ?? MON_SAT,
    ...(c.rollForward !== undefined ? { rollForward: c.rollForward } : {}),
  };
}

describe("resolveDate golden cases", () => {
  const cases = golden.cases as Case[];
  it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const r = resolveDate(c.rule as DateRule, ctxFor(c));
    const w = c.want;
    if (w.error) {
      expect(isDateError(r)).toBe(true);
      if (!isDateError(r)) return;
      expect(r.error).toBe(w.error);
      if (w.anchor) expect(r.anchor).toBe(w.anchor);
      expect(r.message.length).toBeGreaterThan(0);
      return;
    }
    if (isDateError(r)) throw new Error(`unexpected error: ${r.error} ${r.message}`);
    const ok = r as ResolvedDateDetail;
    if (w.dueOn) expect(ok.dueOn).toBe(w.dueOn);
    expect(ok.windowEndOn).toBe(w.windowEndOn);
    if (w.originalDueOn) expect(ok.originalDueOn).toBe(w.originalDueOn);
    if (w.basis) expect(ok.basis).toBe(w.basis);
    if (w.windowBasis) expect(ok.windowBasis).toBe(w.windowBasis);
    if (w.adjustments) expect(ok.adjustments).toEqual(w.adjustments);
    if (w.warnings) expect(ok.warnings).toEqual(w.warnings);
    for (const m of w.adjustmentsMatch ?? []) expect(ok.adjustments.join(" | ")).toContain(m);
    for (const m of w.warningsMatch ?? []) expect(ok.warnings.join(" | ")).toContain(m);
    expect(ok.rule).toEqual(c.rule);
  });

  it("records where we agree and differ with the demo engine", () => {
    const cases2 = golden.cases as Case[];
    for (const c of cases2.filter((x) => x.demo)) {
      const r = resolveDate(c.rule as DateRule, ctxFor(c));
      const ours = isDateError(r) ? null : r.dueOn;
      const demo = c.demo?.dueOn ?? null;
      if (c.demo?.agrees) expect(ours, c.name).toBe(demo);
      else {
        expect(ours, c.name).not.toBe(demo);
        expect(c.demo?.note, `${c.name} must explain the difference`).toBeTruthy();
      }
    }
  });
});

describe("resolveDate details", () => {
  const base: DateContext = {
    anchors: { receipt: "2026-10-24" },
    holidays: [],
    workingDays: MON_SAT,
  };

  it("does not mutate the context and is deterministic", () => {
    const ctx = structuredClone(base);
    const rule: DateRule = { type: "relative", anchor: "receipt", amount: 30, unit: "days" };
    const a = resolveDate(rule, ctx);
    const b = resolveDate(rule, ctx);
    expect(a).toEqual(b);
    expect(ctx).toEqual(base);
  });

  it("stores the inputs so the working can be recomputed", () => {
    const r = resolveDate({ type: "relative", anchor: "receipt", amount: 30, unit: "days" }, base);
    if (isDateError(r)) throw new Error(r.message);
    expect(r.inputs).toEqual({
      anchor: "receipt",
      anchorDate: "2026-10-24",
      amount: 30,
      unit: "days",
      rollForward: false,
    });
  });

  it("uses singular words for one", () => {
    const r = resolveDate(
      { type: "relative", anchor: "order", amount: 1, unit: "days" },
      {
        ...base,
        anchors: { order: "2026-11-02" },
      },
    );
    if (isDateError(r)) throw new Error(r.message);
    expect(r.basis).toBe("1 day from the order on 2 Nov 2026");
  });

  it("rejects a non-positive amount", () => {
    const r = resolveDate({ type: "relative", anchor: "receipt", amount: 0, unit: "days" }, base);
    expect(isDateError(r) && r.error).toBe("invalid_rule");
  });

  it("returns an error, never throws, for a period too long to be real", () => {
    const cases: DateRule[] = [
      { type: "relative", anchor: "receipt", amount: 100_000_000, unit: "days" },
      { type: "relative", anchor: "receipt", amount: 120_000, unit: "months" },
      { type: "relative", anchor: "receipt", amount: 3_661, unit: "working_days" },
      { type: "relative", anchor: "receipt", amount: 1.5, unit: "days" },
      { type: "relative", anchor: "receipt", amount: Number.NaN, unit: "days" },
      {
        type: "relative",
        anchor: "receipt",
        amount: 30,
        unit: "days",
        condonable: { amount: 1_000_000, unit: "months" },
      },
    ];
    for (const rule of cases) {
      const r = resolveDate(rule, base);
      expect(isDateError(r) && r.error, JSON.stringify(rule)).toBe("invalid_rule");
    }
    // The bounds themselves still resolve.
    for (const unit of ["days", "working_days", "months"] as const) {
      const r = resolveDate(
        { type: "relative", anchor: "receipt", amount: MAX_PERIOD[unit], unit },
        base,
      );
      expect(isDateError(r), unit).toBe(false);
    }
  });

  it("returns an error, never throws, for an invalid working week", () => {
    const rel: DateRule = { type: "relative", anchor: "receipt", amount: 3, unit: "working_days" };
    for (const workingDays of [[8], [0], [1, 2, 3.5], [-1]]) {
      const r = resolveDate(rel, { ...base, workingDays, rollForward: true });
      expect(isDateError(r) && r.error, JSON.stringify(workingDays)).toBe("invalid_rule");
    }
    // Every day a holiday: the roll-forward cannot find a working day.
    const holidays = Array.from({ length: 500 }, (_, i) => addDays("2026-10-20", i));
    const r = resolveDate(
      { type: "relative", anchor: "receipt", amount: 1, unit: "days" },
      { ...base, holidays, rollForward: true },
    );
    expect(isDateError(r) && r.error).toBe("invalid_rule");
  });

  it("never throws, whatever the rule (property)", () => {
    // A small deterministic generator, so a failure reproduces.
    let seed = 7;
    const rand = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
    const amounts = [0, 1, 7, 30, 3_660, 3_661, 1e6, 1e12, -5, 2.5, Number.NaN, Infinity];
    for (let i = 0; i < 500; i++) {
      const rule = pick([
        {
          type: "relative",
          anchor: pick(["receipt", "issue", "order", "service", "hearing"]),
          amount: pick(amounts),
          unit: pick(["days", "working_days", "months", "weeks"]),
          ...(rand() < 0.3
            ? { condonable: { amount: pick(amounts), unit: pick(["days", "months", "years"]) } }
            : {}),
        },
        { type: "fixed", date: pick(["2026-02-30", "2026-11-20", "x", "99999-01-01"]) },
        {
          type: "statutory",
          ruleKey: pick(["in.gst.gstr3b.monthly", "nope"]),
          period: pick(["2026-10", "FY2025-26", "garbage"]),
        },
      ]) as DateRule;
      const ctx: DateContext = {
        anchors: {
          receipt: pick(["2026-11-20", "2026-02-31", "9999-12-31"]),
          issue: "2026-11-01",
          order: "2026-10-01",
        },
        holidays: [],
        workingDays: pick([[1, 2, 3, 4, 5, 6], [], [7], [8], [0, 1]]),
        rollForward: rand() < 0.5,
      };
      expect(() => resolveDate(rule, ctx), JSON.stringify({ rule, ctx })).not.toThrow();
    }
  });

  it("delegates statutory rules to the calendar", () => {
    const r = resolveDate(
      { type: "statutory", ruleKey: "in.gst.gstr3b.monthly", period: "2026-10" },
      base,
    );
    if (isDateError(r)) throw new Error(r.message);
    expect(r.dueOn).toBe("2026-11-20");
    expect(r.basis).toBe("GSTR-3B for Oct 2026: 20th of the following month");
  });

  it("applies extensions passed in the context to statutory rules", () => {
    const r = resolveDate(
      { type: "statutory", ruleKey: "in.gst.gstr3b.monthly", period: "2026-10" },
      {
        ...base,
        extensions: [
          {
            ruleKey: "in.gst.gstr3b.monthly",
            period: "2026-10",
            newDueOn: "2026-11-25",
            source: "Notification 99/2026-CT (fictional)",
            announcedOn: "2026-11-18",
          },
        ],
      },
    );
    if (isDateError(r)) throw new Error(r.message);
    expect(r.dueOn).toBe("2026-11-25");
    expect(r.originalDueOn).toBe("2026-11-20");
  });
});

describe("calendar arithmetic", () => {
  it("leap years", () => {
    expect([1900, 2000, 2024, 2026, 2028, 2100].map(isLeapYear)).toEqual([
      false,
      true,
      true,
      false,
      true,
      false,
    ]);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2027, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
  });
  it("validates ISO dates", () => {
    expect(isValidIsoDate("2028-02-29")).toBe(true);
    expect(isValidIsoDate("2027-02-29")).toBe(false);
    expect(isValidIsoDate("2026-00-10")).toBe(false);
    expect(isValidIsoDate("26-11-16")).toBe(false);
  });
  it("adds negative months", () => {
    expect(addMonths("2026-03-31", -1)).toEqual({ date: "2026-02-28", clamped: true });
    expect(addMonths("2026-01-15", -13)).toEqual({ date: "2024-12-15", clamped: false });
  });
  it("weekdays", () => {
    expect(isoWeekday("2026-11-16")).toBe(1);
    expect(isoWeekday("2026-11-22")).toBe(7);
  });
  it("working days count from the day after", () => {
    const cal = { workingDays: [1, 2, 3, 4, 5], holidays: [] };
    expect(addWorkingDays("2026-11-20", 1, cal)).toBe("2026-11-23");
    expect(addWorkingDays("2026-11-16", 5, cal)).toBe("2026-11-23");
    expect(() => addWorkingDays("2026-11-16", 1, { workingDays: [], holidays: [] })).toThrow();
  });
  it("diffs across years", () => {
    expect(diffDays("2026-12-31", "2027-01-01")).toBe(1);
  });
});

describe("due ladder", () => {
  const today = "2026-11-16";
  it.each([
    ["2026-11-15", "overdue"],
    ["2026-11-16", "today"],
    ["2026-11-17", "this_week"],
    ["2026-11-22", "this_week"],
    ["2026-11-23", "later"],
  ])("%s → %s", (due, want) => {
    expect(dueBucket(due, today)).toBe(want);
  });
  it("done wins", () => {
    expect(dueBucket("2026-11-01", today, { done: true })).toBe("done");
  });
});
