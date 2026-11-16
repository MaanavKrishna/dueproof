import { describe, expect, it } from "vitest";
import { isDateError } from "../dates/types";
import golden from "./fixtures/in-dates.json";
import { generateStatutory } from "./generate";
import { IN_PACK, inOrderWindows } from "./packs/in";
import { parsePeriod, periodsStartingBetween } from "./periods";
import { resolveStatutory } from "./resolve";
import type { Extension, Registration } from "./types";
import { resolveOrderWindow } from "./windows";

interface Case {
  rule: string;
  period: string;
  canonical?: string;
  events?: Record<string, string>;
  dueOn?: string;
  basis?: string;
  warningsMatch?: string;
  error?: string;
}

describe("India pack golden dates", () => {
  it.each((golden.cases as Case[]).map((c) => [`${c.rule} ${c.period}`, c] as const))(
    "%s",
    (_n, c) => {
      const r = resolveStatutory(c.rule, c.period, c.events ? { events: c.events } : {});
      if (c.error) {
        expect(isDateError(r) && r.error).toBe(c.error);
        return;
      }
      if (isDateError(r)) throw new Error(`${r.error}: ${r.message}`);
      expect(r.dueOn).toBe(c.dueOn);
      expect(r.rule).toEqual({
        type: "statutory",
        ruleKey: c.rule,
        period: c.canonical ?? c.period,
      });
      if (c.basis) expect(r.basis).toBe(c.basis);
      if (c.warningsMatch) expect(r.warnings.join(" | ")).toContain(c.warningsMatch);
      expect(r.warnings.join(" ")).toContain("verify in M0");
      expect(r.inputs.packVersion).toBe(IN_PACK.version);
    },
  );
});

describe("India pack data hygiene", () => {
  const keys = IN_PACK.rules.map((r) => r.key);

  it("has unique, well-formed keys", () => {
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^in\.[a-z0-9_]+(\.[a-z0-9_]+)+$/);
  });

  it("marks every rule unverified, with a source and notes (verify in M0)", () => {
    for (const r of IN_PACK.rules) {
      expect(r.verified, r.key).toBe(false);
      expect(r.source.citation.length, r.key).toBeGreaterThan(5);
      expect(r.source.url, r.key).toMatch(/^https:\/\//);
      expect(r.notes.length, r.key).toBeGreaterThan(5);
      expect(r.dueText.length, r.key).toBeGreaterThan(5);
      expect(r.rollForward, r.key).toBe(false);
    }
    for (const w of inOrderWindows) expect(w.verified, w.key).toBe(false);
  });

  it("covers the D-prod-3 forms", () => {
    const forms = new Set(IN_PACK.rules.map((r) => r.form));
    for (const f of [
      "GSTR-1",
      "GSTR-3B",
      "GSTR-9",
      "Form 24Q",
      "Form 26Q",
      "Advance tax",
      "ITR",
      "AOC-4",
      "MGT-7",
    ]) {
      expect(forms.has(f), f).toBe(true);
    }
    expect(keys).toContain("in.tds.payment.monthly");
  });

  it("every rule resolves for FY 2026-27 periods", () => {
    for (const r of IN_PACK.rules) {
      const periods = periodsStartingBetween(r.periodType, "2026-04-01", "2027-03-31", 4, 4);
      expect(periods.length, r.key).toBeGreaterThan(0);
      for (const p of periods) {
        const out = resolveStatutory(r.key, p.canonical);
        expect(isDateError(out), `${r.key} ${p.canonical}`).toBe(false);
        if (!isDateError(out)) expect(out.dueOn > p.start, `${r.key} ${p.canonical}`).toBe(true);
      }
    }
  });

  it("maps every GST state code to one QRMP group", () => {
    const groups = Object.values(IN_PACK.stateGroups ?? {});
    expect(groups.every((g) => g === "A" || g === "B")).toBe(true);
    expect(Object.keys(IN_PACK.stateGroups ?? {})).toHaveLength(37);
  });
});

describe("periods", () => {
  it("parses and labels", () => {
    expect(parsePeriod("2026-10", "month", 4)?.label).toBe("Oct 2026");
    expect(parsePeriod("FY2026-27-Q1", "quarter", 4)).toMatchObject({
      start: "2026-04-01",
      end: "2026-06-30",
      fyStart: 2026,
      label: "Q1 FY 2026–27 (Apr–Jun 2026)",
    });
    expect(parsePeriod("FY2026-27-Q4", "quarter", 4)).toMatchObject({
      start: "2027-01-01",
      end: "2027-03-31",
    });
    expect(parsePeriod("FY2025-26", "fy", 4)).toMatchObject({
      start: "2025-04-01",
      end: "2026-03-31",
    });
    expect(parsePeriod("FY2026-27-I3", "fy_instalment", 4)?.label).toBe("Instalment 3, FY 2026–27");
    expect(parsePeriod("2026-02", "month", 4)?.end).toBe("2026-02-28");
    expect(parsePeriod("2028-02", "month", 4)?.end).toBe("2028-02-29");
  });

  it("supports other FY starts", () => {
    expect(parsePeriod("FY2026", "fy", 1)).toMatchObject({
      start: "2026-01-01",
      end: "2026-12-31",
      label: "FY 2026",
    });
    expect(parsePeriod("FY2026-27", "fy", 1)).toBeNull();
    expect(parsePeriod("FY2026-27-Q1", "quarter", 7)).toMatchObject({
      start: "2026-07-01",
      end: "2026-09-30",
    });
    expect(parsePeriod("FY2026-27-Q3", "quarter", 7)?.label).toBe("Q3 FY 2026–27 (Jan–Mar 2027)");
    // Calendar quarters cannot be mapped when FY quarters straddle them.
    expect(parsePeriod("2026-Q1", "quarter", 2)).toBeNull();
  });

  it("enumerates periods by start date", () => {
    const months = periodsStartingBetween("month", "2026-11-15", "2027-02-01", 4);
    expect(months.map((p) => p.canonical)).toEqual(["2026-12", "2027-01", "2027-02"]);
    const qs = periodsStartingBetween("quarter", "2026-01-01", "2026-12-31", 4);
    expect(qs.map((p) => p.canonical)).toEqual([
      "FY2025-26-Q4",
      "FY2026-27-Q1",
      "FY2026-27-Q2",
      "FY2026-27-Q3",
    ]);
    const inst = periodsStartingBetween("fy_instalment", "2026-04-01", "2026-04-01", 4, 4);
    expect(inst.map((p) => p.canonical)).toEqual([
      "FY2026-27-I1",
      "FY2026-27-I2",
      "FY2026-27-I3",
      "FY2026-27-I4",
    ]);
  });
});

const KERALA_MONTHLY: Registration = {
  id: "g1",
  clientId: "c1",
  kind: "gst",
  identifier: "32ABCDE1234F1Z5",
  frequency: "monthly",
};
const DELHI_QRMP: Registration = {
  id: "g2",
  clientId: "c2",
  kind: "gst",
  identifier: "07ABCDE1234F1Z5",
  frequency: "quarterly",
  scheme: "qrmp",
};
const MAHARASHTRA_MONTHLY: Registration = {
  id: "g3",
  clientId: "c3",
  kind: "gst",
  identifier: "27ABCDE1234F1Z5",
  frequency: "monthly",
  scheme: "regular",
};
const COMPOSITION: Registration = {
  id: "g4",
  kind: "gst",
  identifier: "29ABCDE1234F1Z5",
  scheme: "composition",
};
const TAN: Registration = { id: "t1", clientId: "c1", kind: "tds", identifier: "BLRA12345B" };
const COMPANY_IT: Registration = {
  id: "i1",
  clientId: "c1",
  kind: "income_tax",
  attributes: { audit: true },
};
const PRESUMPTIVE: Registration = {
  id: "i2",
  clientId: "c2",
  kind: "income_tax",
  attributes: { advanceTax: "presumptive", audit: false },
};
const COMPANY_ROC: Registration = {
  id: "r1",
  clientId: "c1",
  kind: "roc",
  identifier: "U72900KL2015PTC012345",
  attributes: { companyType: "private" },
  events: { "FY2025-26": { agm: "2026-09-25" } },
};

describe("generateStatutory", () => {
  it("lists what falls due in November 2026", () => {
    const items = generateStatutory(
      [KERALA_MONTHLY, DELHI_QRMP, TAN, COMPANY_IT, PRESUMPTIVE, COMPANY_ROC],
      { from: "2026-11-01", to: "2026-11-30" },
    );
    expect(items.map((i) => [i.dueOn, i.statutoryKey, i.registrationId])).toEqual([
      ["2026-11-07", "in.tds.payment.monthly:2026-10", "t1"],
      ["2026-11-11", "in.gst.gstr1.monthly:2026-10", "g1"],
      ["2026-11-20", "in.gst.gstr3b.monthly:2026-10", "g1"],
      ["2026-11-24", "in.roc.mgt7:FY2025-26", "r1"],
    ]);
    const first = items[0];
    expect(first).toMatchObject({
      clientId: "c1",
      form: "TDS payment (challan ITNS 281)",
      periodLabel: "Oct 2026",
      verified: false,
      packVersion: IN_PACK.version,
      packAsOf: IN_PACK.asOf,
      rule: { type: "statutory", ruleKey: "in.tds.payment.monthly", period: "2026-10" },
    });
  });

  it("builds a QRMP year with state-group days (Delhi → group B)", () => {
    const items = generateStatutory([DELHI_QRMP], { from: "2026-04-01", to: "2027-03-31" });
    expect(items.map((i) => `${i.dueOn} ${i.statutoryKey}`)).toEqual([
      "2026-04-13 in.gst.gstr1.qrmp:FY2025-26-Q4",
      "2026-04-24 in.gst.gstr3b.qrmp.b:FY2025-26-Q4",
      "2026-07-13 in.gst.gstr1.qrmp:FY2026-27-Q1",
      "2026-07-24 in.gst.gstr3b.qrmp.b:FY2026-27-Q1",
      "2026-10-13 in.gst.gstr1.qrmp:FY2026-27-Q2",
      "2026-10-24 in.gst.gstr3b.qrmp.b:FY2026-27-Q2",
      "2026-12-31 in.gst.gstr9.annual:FY2025-26",
      "2027-01-13 in.gst.gstr1.qrmp:FY2026-27-Q3",
      "2027-01-24 in.gst.gstr3b.qrmp.b:FY2026-27-Q3",
    ]);
    const sunday = items.find((i) => i.dueOn === "2027-01-24");
    expect(sunday?.warnings.join(" ")).toContain("falls on a Sun");
    expect(sunday?.adjustments).toEqual([]);
  });

  it("uses group A days for a QRMP filer in Kerala, and an explicit state group wins", () => {
    const kerala = { ...DELHI_QRMP, id: "g5", identifier: "32ABCDE1234F1Z5" };
    const items = generateStatutory([kerala], { from: "2026-10-01", to: "2026-10-31" });
    expect(items.map((i) => i.statutoryKey)).toEqual([
      "in.gst.gstr1.qrmp:FY2026-27-Q2",
      "in.gst.gstr3b.qrmp.a:FY2026-27-Q2",
    ]);
    const forced = { ...kerala, attributes: { stateGroup: "B" } };
    const items2 = generateStatutory([forced], { from: "2026-10-01", to: "2026-10-31" });
    expect(items2.map((i) => i.ruleKey)).toContain("in.gst.gstr3b.qrmp.b");
  });

  it("a QRMP filer with no known state gets no GSTR-3B (and the gap is visible as no item)", () => {
    const unknown = { ...DELHI_QRMP, id: "g6", identifier: "not-a-gstin" };
    const items = generateStatutory([unknown], { from: "2026-10-01", to: "2026-10-31" });
    expect(items.map((i) => i.ruleKey)).toEqual(["in.gst.gstr1.qrmp"]);
  });

  it("generates nothing for composition-scheme GST in v0.1", () => {
    expect(generateStatutory([COMPOSITION], { from: "2026-04-01", to: "2027-03-31" })).toEqual([]);
  });

  it("produces all four TDS return quarters and the March payment special case", () => {
    const items = generateStatutory([TAN], { from: "2026-04-01", to: "2027-05-31" });
    const ret = items.filter((i) => i.ruleKey === "in.tds.24q.quarterly").map((i) => i.dueOn);
    expect(ret).toEqual(["2026-05-31", "2026-07-31", "2026-10-31", "2027-01-31", "2027-05-31"]);
    expect(items.find((i) => i.statutoryKey === "in.tds.payment.monthly:2027-03")?.dueOn).toBe(
      "2027-04-30",
    );
    expect(items.find((i) => i.statutoryKey === "in.tds.payment.monthly:2026-03")?.dueOn).toBe(
      "2026-04-30",
    );
  });

  it("respects registration validity", () => {
    const reg = { ...KERALA_MONTHLY, validFrom: "2026-07-01", validTo: "2026-09-15" };
    const items = generateStatutory([reg], { from: "2026-07-01", to: "2026-12-31" });
    const periods = items.filter((i) => i.ruleKey === "in.gst.gstr3b.monthly").map((i) => i.period);
    expect(periods).toEqual(["2026-07", "2026-08", "2026-09"]);
  });

  it("advance tax: four instalments for a company, one for presumptive", () => {
    const items = generateStatutory([COMPANY_IT, PRESUMPTIVE], {
      from: "2026-04-01",
      to: "2027-03-31",
    });
    const at = items.filter((i) => i.form === "Advance tax");
    expect(at.map((i) => `${i.registrationId} ${i.dueOn}`)).toEqual([
      "i1 2026-06-15",
      "i1 2026-09-15",
      "i1 2026-12-15",
      "i1 2027-03-15",
      "i2 2027-03-15",
    ]);
    const itr = items.filter((i) => i.form === "ITR").map((i) => `${i.registrationId} ${i.dueOn}`);
    expect(itr).toEqual(["i2 2026-07-31", "i1 2026-10-31"]);
  });

  it("skips advance tax when marked none", () => {
    const none: Registration = { id: "i3", kind: "income_tax", attributes: { advanceTax: "none" } };
    const items = generateStatutory([none], { from: "2026-04-01", to: "2027-03-31" });
    expect(items.map((i) => i.ruleKey)).toEqual(["in.it.itr.non_audit"]);
  });

  it("is empty for a reversed range", () => {
    expect(generateStatutory([TAN], { from: "2026-12-01", to: "2026-11-01" })).toEqual([]);
  });

  it("statutory keys are unique per registration", () => {
    const items = generateStatutory(
      [KERALA_MONTHLY, DELHI_QRMP, TAN, COMPANY_IT, PRESUMPTIVE, COMPANY_ROC],
      { from: "2025-04-01", to: "2028-03-31" },
    );
    const keys = items.map((i) => `${i.registrationId}|${i.statutoryKey}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(items.length).toBeGreaterThan(100);
  });
});

describe("extensions", () => {
  const range = { from: "2026-11-01", to: "2026-11-30" };
  const keralaOnly: Extension = {
    ruleKey: "in.gst.gstr3b.monthly",
    period: "2026-10",
    newDueOn: "2026-11-27",
    source: "Notification 99/2026-Central Tax (fictional, for tests)",
    announcedOn: "2026-11-18",
    where: { stateCode: ["32"] },
  };

  it("applies a state-scoped extension only where it matches, and keeps the original date", () => {
    const items = generateStatutory([KERALA_MONTHLY, MAHARASHTRA_MONTHLY], range, IN_PACK, [
      keralaOnly,
    ]);
    const k = items.find((i) => i.registrationId === "g1" && i.ruleKey === "in.gst.gstr3b.monthly");
    const m = items.find((i) => i.registrationId === "g3" && i.ruleKey === "in.gst.gstr3b.monthly");
    expect(k?.dueOn).toBe("2026-11-27");
    expect(k?.originalDueOn).toBe("2026-11-20");
    expect(k?.adjustments[0]).toBe(
      "Extended from 20 Nov 2026 to 27 Nov 2026 by Notification 99/2026-Central Tax (fictional, for tests) (announced 18 Nov 2026).",
    );
    expect(m?.dueOn).toBe("2026-11-20");
    expect(m?.adjustments).toEqual([]);
  });

  it("the latest announcement wins; a firm override is labelled", () => {
    const { where: _scope, ...unscoped } = keralaOnly;
    const later: Extension = { ...unscoped, newDueOn: "2026-11-30", announcedOn: "2026-11-25" };
    const r = resolveStatutory("in.gst.gstr3b.monthly", "2026-10", {
      extensions: [later, { ...keralaOnly, where: { stateCode: ["32", "27"] } }],
      facts: { stateCode: "27" },
    });
    if (isDateError(r)) throw new Error(r.message);
    expect(r.dueOn).toBe("2026-11-30");

    const firm = resolveStatutory("in.gst.gstr1.monthly", "2026-10", {
      extensions: [
        {
          ruleKey: "in.gst.gstr1.monthly",
          period: "2026-10",
          newDueOn: "2026-11-09",
          source: "Partner's internal deadline",
          announcedOn: "2026-10-01",
          kind: "firm",
        },
      ],
    });
    if (isDateError(firm)) throw new Error(firm.message);
    expect(firm.dueOn).toBe("2026-11-09");
    expect(firm.adjustments[0]).toMatch(/^Firm override: 11 Nov 2026 → 9 Nov 2026/);
  });

  it("matches extensions written with a calendar-quarter period", () => {
    const r = resolveStatutory("in.gst.gstr1.qrmp", "FY2026-27-Q3", {
      extensions: [
        {
          ruleKey: "in.gst.gstr1.qrmp",
          period: "2026-Q4",
          newDueOn: "2027-01-20",
          source: "Notification (fictional)",
          announcedOn: "2027-01-10",
        },
      ],
    });
    if (isDateError(r)) throw new Error(r.message);
    expect(r.dueOn).toBe("2027-01-20");
  });

  it("a scoped extension does not apply without registration facts", () => {
    const r = resolveStatutory("in.gst.gstr3b.monthly", "2026-10", { extensions: [keralaOnly] });
    if (isDateError(r)) throw new Error(r.message);
    expect(r.dueOn).toBe("2026-11-20");
  });
});

describe("order windows", () => {
  const ctx = { anchors: { service: "2026-08-31" }, holidays: [], workingDays: [1, 2, 3, 4, 5, 6] };

  it("GST s.107: normal date and condonation limit, separately", () => {
    const r = resolveOrderWindow(inOrderWindows, "in.gst.appeal.s107", ctx);
    if (isDateError(r)) throw new Error(r.message);
    expect(r.dueOn).toBe("2026-11-30");
    expect(r.windowEndOn).toBe("2026-12-30");
    expect(r.basis).toBe(
      "Appeal to the GST Appellate Authority: 3 months from service on 31 Aug 2026",
    );
  });

  it("CIT(A): 30 days, no fixed condonation limit", () => {
    const r = resolveOrderWindow(inOrderWindows, "in.it.appeal.cita", ctx);
    if (isDateError(r)) throw new Error(r.message);
    expect(r.dueOn).toBe("2026-09-30");
    expect(r.windowEndOn).toBeUndefined();
    expect(r.warnings.join(" ")).toContain("No fixed condonation limit");
  });

  it("needs the communication date before it can compute", () => {
    const r = resolveOrderWindow(inOrderWindows, "in.it.appeal.itat", { ...ctx, anchors: {} });
    expect(isDateError(r) && r.error).toBe("missing_anchor");
    expect(resolveOrderWindow(inOrderWindows, "nope", ctx)).toMatchObject({
      error: "unknown_rule",
    });
  });
});
