import { describe, expect, it } from "vitest";
import { isDateError } from "../dates/types";
import { statutoryCoverage } from "./coverage";
import golden from "./fixtures/in-dates.json";
import { formKey, generateStatutory, statutoryKey } from "./generate";
import { IN_EXTENSIONS, IN_PACK, inOrderWindowFor, inOrderWindows } from "./packs/in";
import { parsePeriod, periodsStartingBetween } from "./periods";
import { resolveStatutory } from "./resolve";
import type { Extension, Registration, StatutoryItem } from "./types";
import { resolveOrderWindow } from "./windows";

const rulePeriod = (i: StatutoryItem) => `${i.ruleKey}:${i.period}`;

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
    expect(items.map((i) => [i.dueOn, i.statutoryKey, i.ruleKey])).toEqual([
      ["2026-11-07", "t1:tds-payment-challan-itns-281:2026-10", "in.tds.payment.monthly"],
      ["2026-11-11", "g1:gstr-1:2026-10", "in.gst.gstr1.monthly"],
      ["2026-11-20", "g1:gstr-3b:2026-10", "in.gst.gstr3b.monthly"],
      ["2026-11-24", "r1:mgt-7:FY2025-26", "in.roc.mgt7"],
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
    expect(items.map((i) => `${i.dueOn} ${rulePeriod(i)}`)).toEqual([
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
    expect(items.map(rulePeriod)).toEqual([
      "in.gst.gstr1.qrmp:FY2026-27-Q2",
      "in.gst.gstr3b.qrmp.a:FY2026-27-Q2",
    ]);
    expect(items.flatMap((i) => i.warnings).join(" ")).not.toContain("State not known");
    const forced = { ...kerala, attributes: { stateGroup: "B" } };
    const items2 = generateStatutory([forced], { from: "2026-10-01", to: "2026-10-31" });
    expect(items2.map((i) => i.ruleKey)).toContain("in.gst.gstr3b.qrmp.b");
  });

  it.each([
    ["no GSTIN", { identifier: "not-a-gstin" }],
    ["state code 97 (Other Territory)", { identifier: "97ABCDE1234F1Z5" }],
    ["an unlisted state name", { identifier: "not-a-gstin", state: "Atlantis" }],
  ] as const)(
    "a QRMP filer with %s still gets GSTR-3B, on the 22nd, with a check-state note",
    (_n, over) => {
      const unknown: Registration = { ...DELHI_QRMP, id: "g6", ...over };
      const items = generateStatutory([unknown], { from: "2026-10-01", to: "2026-10-31" });
      expect(items.map((i) => `${i.dueOn} ${i.form}`)).toEqual([
        "2026-10-13 GSTR-1",
        "2026-10-22 GSTR-3B",
      ]);
      const gstr3b = items.find((i) => i.form === "GSTR-3B");
      expect(gstr3b?.warnings.join(" ")).toContain(
        "State not known, or not in either QRMP state list",
      );
      expect(gstr3b?.warnings.join(" ")).toContain("Check the state");
      expect(statutoryCoverage([unknown]).filter((n) => n.type === "no_rule")).toEqual([]);
    },
  );

  it("a QRMP scheme with no frequency recorded is quarterly", () => {
    const { frequency: _f, ...noFreq } = DELHI_QRMP;
    const items = generateStatutory([noFreq], { from: "2026-10-01", to: "2026-10-31" });
    expect(items.map(rulePeriod)).toEqual([
      "in.gst.gstr1.qrmp:FY2026-27-Q2",
      "in.gst.gstr3b.qrmp.b:FY2026-27-Q2",
    ]);
  });

  it("a GST registration with no frequency is shown as monthly, flagged, never only GSTR-9", () => {
    const noFreq: Registration = { id: "g7", kind: "gst", identifier: "27ABCDE1234F1Z5" };
    const items = generateStatutory([noFreq], { from: "2026-11-01", to: "2026-12-31" });
    expect(items.map((i) => `${i.dueOn} ${rulePeriod(i)}`)).toEqual([
      "2026-11-11 in.gst.gstr1.monthly:2026-10",
      "2026-11-20 in.gst.gstr3b.monthly:2026-10",
      "2026-12-11 in.gst.gstr1.monthly:2026-11",
      "2026-12-20 in.gst.gstr3b.monthly:2026-11",
      "2026-12-31 in.gst.gstr9.annual:FY2025-26",
    ]);
    for (const i of items.filter((x) => x.form !== "GSTR-9"))
      expect(i.warnings.join(" "), i.statutoryKey).toContain("Filing frequency not recorded");
    // A recorded frequency carries no such warning.
    const monthly = generateStatutory([{ ...noFreq, frequency: "monthly" }], {
      from: "2026-11-01",
      to: "2026-11-30",
    });
    expect(monthly.flatMap((i) => i.warnings).join(" ")).not.toContain("not recorded");
  });

  it("composition: CMP-08 each quarter and GSTR-4 for the year, no GSTR-1/3B/9", () => {
    const items = generateStatutory([COMPOSITION], { from: "2026-04-01", to: "2027-03-31" });
    expect(items.map((i) => `${i.dueOn} ${i.statutoryKey}`)).toEqual([
      "2026-04-18 g4:cmp-08:FY2025-26-Q4",
      "2026-06-30 g4:gstr-4:FY2025-26",
      "2026-07-18 g4:cmp-08:FY2026-27-Q1",
      "2026-10-18 g4:cmp-08:FY2026-27-Q2",
      "2027-01-18 g4:cmp-08:FY2026-27-Q3",
    ]);
    for (const i of items) expect(i.verified).toBe(false);
  });

  it("produces all four TDS return quarters and the March payment special case", () => {
    const items = generateStatutory([TAN], { from: "2026-04-01", to: "2027-05-31" });
    const ret = items.filter((i) => i.ruleKey === "in.tds.24q.quarterly").map((i) => i.dueOn);
    expect(ret).toEqual(["2026-05-31", "2026-07-31", "2026-10-31", "2027-01-31", "2027-05-31"]);
    expect(items.find((i) => rulePeriod(i) === "in.tds.payment.monthly:2027-03")?.dueOn).toBe(
      "2027-04-30",
    );
    expect(items.find((i) => rulePeriod(i) === "in.tds.payment.monthly:2026-03")?.dueOn).toBe(
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
    const keys = items.map((i) => i.statutoryKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(items.length).toBeGreaterThan(100);
    for (const i of items) expect(i.statutoryKey.startsWith(`${i.registrationId}:`)).toBe(true);
  });

  it("keys on registration, form and period, so a change of rule keeps the key", () => {
    expect(formKey("TDS payment (challan ITNS 281)")).toBe("tds-payment-challan-itns-281");
    expect(statutoryKey("g1", "GSTR-3B", "2026-10")).toBe("g1:gstr-3b:2026-10");
    const range = { from: "2026-10-01", to: "2026-10-31" };
    const kerala = { ...DELHI_QRMP, identifier: "32ABCDE1234F1Z5" };
    const [a] = generateStatutory([kerala], range).filter((i) => i.form === "GSTR-3B");
    const [b] = generateStatutory([DELHI_QRMP], range).filter((i) => i.form === "GSTR-3B");
    expect(a?.ruleKey).not.toBe(b?.ruleKey);
    expect(a?.statutoryKey).toBe(b?.statutoryKey);
    // Two GSTINs for one client never share a key.
    const two = generateStatutory([KERALA_MONTHLY, { ...KERALA_MONTHLY, id: "g9" }], range);
    expect(new Set(two.map((i) => i.statutoryKey)).size).toBe(two.length);
  });

  it("advance tax: an instalment due before the registration began is not generated", () => {
    const late: Registration = { ...COMPANY_IT, validFrom: "2026-10-01" };
    const items = generateStatutory([late], { from: "2026-04-01", to: "2027-03-31" });
    expect(items.filter((i) => i.form === "Advance tax").map((i) => i.dueOn)).toEqual([
      "2026-12-15",
      "2027-03-15",
    ]);
    const onTheDay: Registration = { ...COMPANY_IT, validFrom: "2026-09-15" };
    const items2 = generateStatutory([onTheDay], { from: "2026-04-01", to: "2027-03-31" });
    expect(items2.filter((i) => i.form === "Advance tax").map((i) => i.dueOn)).toEqual([
      "2026-09-15",
      "2026-12-15",
      "2027-03-15",
    ]);
  });

  it("an AGM date from another year is not used, and says so", () => {
    const wrong: Registration = { ...COMPANY_ROC, events: { "FY2025-26": { agm: "2024-09-25" } } };
    const items = generateStatutory([wrong], { from: "2026-10-01", to: "2026-11-30" });
    expect(items.map((i) => `${i.dueOn} ${i.form}`)).toEqual([
      "2026-10-30 AOC-4",
      "2026-11-29 MGT-7",
    ]);
    for (const i of items) expect(i.warnings.join(" ")).toContain("cannot be that year's AGM");
  });

  it("an OPC files MGT-7A on 26 November, under the same key as MGT-7", () => {
    const opc: Registration = { ...COMPANY_ROC, attributes: { companyType: "opc" }, events: {} };
    const items = generateStatutory([opc], { from: "2026-09-01", to: "2026-11-30" });
    expect(items.map((i) => `${i.dueOn} ${i.ruleKey} ${i.statutoryKey}`)).toEqual([
      "2026-09-27 in.roc.aoc4.opc r1:aoc-4:FY2025-26",
      "2026-11-26 in.roc.mgt7a.opc r1:mgt-7:FY2025-26",
    ]);
  });

  it("a tax-audit case gets the audit report a month before the return", () => {
    const items = generateStatutory([COMPANY_IT], { from: "2026-09-01", to: "2026-10-31" });
    expect(items.map((i) => `${i.dueOn} ${i.form}`)).toEqual([
      "2026-09-15 Advance tax",
      "2026-09-30 Form 3CD",
      "2026-10-31 ITR",
    ]);
  });
});

describe("coverage: what the calendar does not cover", () => {
  it("lists not-covered obligations for each registration", () => {
    const notes = statutoryCoverage([DELHI_QRMP, TAN, PRESUMPTIVE, COMPANY_ROC, KERALA_MONTHLY]);
    const by = (id: string) => notes.filter((n) => n.registrationId === id).map((n) => n.form);
    expect(by("g2")).toEqual(["PMT-06", "IFF", "GSTR-9C"]);
    expect(by("t1")).toEqual(["Form 27Q", "Form 27EQ"]);
    expect(by("i2")).toEqual(["Form 26QB / 26QC / 26QD"]);
    expect(by("r1")).toEqual(["DIR-3 KYC"]);
    expect(by("g1")).toEqual(["GSTR-9C"]);
    for (const n of notes) {
      expect(n.type).toBe("not_covered");
      expect(n.source?.citation.length, n.form).toBeGreaterThan(5);
      expect(n.reason.length, n.form).toBeGreaterThan(20);
    }
    for (const m of IN_PACK.notCovered ?? []) expect(m.verified, m.key).toBe(false);
  });

  it("an expected form with no fitting rule is reported, not dropped", () => {
    const odd: Registration = {
      id: "g8",
      kind: "gst",
      identifier: "27ABCDE1234F1Z5",
      frequency: "monthly",
      scheme: "qrmp",
    };
    const range = { from: "2026-10-01", to: "2027-03-31" };
    expect(generateStatutory([odd], range).map((i) => i.form)).toEqual(["GSTR-9"]);
    const gaps = statutoryCoverage([odd]).filter((n) => n.type === "no_rule");
    expect(gaps.map((n) => n.form)).toEqual(["GSTR-1", "GSTR-3B"]);
    expect(gaps[0]?.reason).toContain('frequency "monthly"');
    expect(gaps[0]?.reason).toContain('scheme "qrmp"');

    const forcedGroup: Registration = { ...DELHI_QRMP, attributes: { stateGroup: "C" } };
    const forcedGaps = statutoryCoverage([forcedGroup]).filter((n) => n.type === "no_rule");
    expect(forcedGaps.map((n) => n.form)).toEqual(["GSTR-3B"]);
  });

  it("a registration that no rule fits says so", () => {
    const casual: Registration = { id: "g9", kind: "gst", frequency: "monthly", scheme: "casual" };
    const other: Registration = { id: "o1", kind: "other" };
    const notes = statutoryCoverage([casual, other]);
    expect(notes.map((n) => [n.registrationId, n.type, n.title])).toEqual([
      ["g9", "no_rule", "Nothing on the calendar for this registration"],
      ["o1", "no_rule", "Nothing on the calendar for this registration"],
    ]);
  });

  it("a fully covered registration has only its not-covered markers", () => {
    expect(statutoryCoverage([COMPOSITION]).filter((n) => n.type === "no_rule")).toEqual([]);
    expect(statutoryCoverage([COMPANY_IT]).map((n) => n.type)).toEqual(["not_covered"]);
  });
});

describe("India extensions data", () => {
  it("every extension names a pack rule, a parseable period, a real date and its source", () => {
    for (const e of IN_EXTENSIONS) {
      const rule = IN_PACK.rules.find((r) => r.key === e.ruleKey);
      expect(rule, e.ruleKey).toBeDefined();
      if (!rule) continue;
      expect(parsePeriod(e.period, rule.periodType, IN_PACK.fyStartMonth), e.period).not.toBeNull();
      expect(e.source).toMatch(/notification|circular|press release|order/i);
      const r = resolveStatutory(e.ruleKey, e.period, { extensions: [e] });
      expect(isDateError(r), e.ruleKey).toBe(false);
    }
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

  it("ITAT: two months from the end of the month of communication, from 1 Oct 2024", () => {
    const r = resolveOrderWindow(inOrderWindows, "in.it.appeal.itat", {
      ...ctx,
      anchors: { service: "2026-10-10" },
    });
    if (isDateError(r)) throw new Error(r.message);
    expect(r.dueOn).toBe("2026-12-31");
    expect(r.basis).toBe(
      "Appeal to the Income Tax Appellate Tribunal: 2 months from the end of the month of service on 10 Oct 2026 (31 Oct 2026)",
    );
    expect(r.inputs.countedFrom).toBe("2026-10-31");
    expect(r.windowRule.source.citation).toContain("Finance (No. 2) Act 2024");
    // Communicated before 1 Oct 2024: the old rule, from the date itself.
    const old = resolveOrderWindow(inOrderWindows, "in.it.appeal.itat", {
      ...ctx,
      anchors: { service: "2024-09-10" },
    });
    if (isDateError(old)) throw new Error(old.message);
    expect(old.dueOn).toBe("2024-11-10");
  });

  it.each([
    ["GST notice", "GST notice", "in.gst.appeal.s107"],
    ["Show-cause notice under section 73 of the CGST Act", "Demand notice", "in.gst.appeal.s107"],
    ["Income-tax notice", "Demand notice", "in.it.appeal.cita"],
    ["TDS notice", null, "in.it.appeal.cita"],
    ["Income-tax notice", "Notice under section 148A", "in.it.appeal.cita"],
  ] as const)("order window for %s / %s → %s", (notice, doc, key) => {
    expect(inOrderWindowFor(notice, doc)).toEqual({ key });
  });

  it.each([
    ["GST notice", "Order of the Appellate Authority (APL-04)"],
    ["GST notice", "Order-in-Appeal"],
    ["GST notice", "Court or tribunal order"],
    ["Income-tax notice", "Order of the CIT(A)"],
    ["Income-tax notice", "ITAT order"],
    ["GST notice", "Income-tax notice"],
    ["Legal notice", "Notice"],
    // Loose text that used to match: "it", bare section numbers.
    ["Please treat it as urgent", "Order dated 14.3.2026 ref 156"],
    [null, null],
  ] as const)("no automatic window for %s / %s: flagged for review", (notice, doc) => {
    const r = inOrderWindowFor(notice, doc);
    expect(r.key).toBeNull();
    expect("review" in r && r.review).toMatch(/by hand/);
  });

  it("needs the communication date before it can compute", () => {
    const r = resolveOrderWindow(inOrderWindows, "in.it.appeal.itat", { ...ctx, anchors: {} });
    expect(isDateError(r) && r.error).toBe("missing_anchor");
    expect(resolveOrderWindow(inOrderWindows, "nope", ctx)).toMatchObject({
      error: "unknown_rule",
    });
  });
});
