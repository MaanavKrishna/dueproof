import { describe, expect, it } from "vitest";
import {
  ayLabel,
  createTranslator,
  daysBetween,
  fiscalYearStart,
  formatDate,
  formatIndianCompact,
  formatMoney,
  formatMonth,
  formatRelativeDue,
  fyLabel,
  minorToDecimalString,
  parseIsoDate,
  t,
} from "./index";

describe("formatMoney (en-IN, INR)", () => {
  const cases: [number | bigint, string][] = [
    [0, "₹0"],
    [100, "₹1"],
    [50, "₹0.50"],
    [45230000, "₹4,52,300"],
    [45230050, "₹4,52,300.50"],
    [12000000000, "₹12,00,00,000"],
    [-45230000, "-₹4,52,300"],
    // beyond Number.MAX_SAFE_INTEGER, as bigint
    [123456789012345678n, "₹1,23,45,67,89,01,23,456.78"],
  ];
  it.each(cases)("%s paise → %s", (minor, want) => {
    expect(formatMoney(minor)).toBe(want);
  });

  it("rejects fractional minor units", () => {
    expect(() => formatMoney(1.5)).toThrow(RangeError);
  });
});

describe("formatIndianCompact", () => {
  const cases: [number, string][] = [
    [4_500_000, "₹45,000"], // below one lakh: full amount
    [10_000_000, "₹1 lakh"],
    [45_230_000, "₹4.52 lakh"],
    [45_250_000, "₹4.53 lakh"], // 4.525 rounds half up
    [99_999_000, "₹10 lakh"],
    [999_999_900, "₹1 crore"], // 99.99999 lakh rounds to 100 lakh → 1 crore
    [1_200_000_000, "₹1.2 crore"],
    [120_000_000, "₹12 lakh"],
    [12_000_000_000, "₹12 crore"],
    [120_000_000_000, "₹120 crore"],
    [1_234_567_890_000, "₹1,234.57 crore"],
    [123_456_789_000_000, "₹1,23,456.79 crore"],
    [-45_230_000, "-₹4.52 lakh"],
  ];
  it.each(cases)("%s paise → %s", (minor, want) => {
    expect(formatIndianCompact(minor)).toBe(want);
  });

  it("₹1.2 crore", () => {
    expect(formatMoney(1_20_00_000_00, { compact: true })).toBe("₹1.2 crore");
  });
});

describe("formatMoney elsewhere", () => {
  it("uses thousands grouping in en-US", () => {
    expect(formatMoney(45230000, { locale: "en-US", currency: "USD" })).toBe("$452,300");
  });
  it("uses Intl compact notation outside India", () => {
    expect(formatMoney(120_000_000, { locale: "en-US", currency: "USD", compact: true })).toBe(
      "$1.2M",
    );
    expect(formatMoney(452_300_00, { locale: "en-GB", currency: "GBP", compact: true })).toBe(
      "£452.3k",
    );
  });
  it("handles zero-decimal currencies", () => {
    expect(formatMoney(1500, { locale: "en-US", currency: "JPY" })).toBe("¥1,500");
  });
  it("INR in a non-Indian locale is not lakh-compacted", () => {
    expect(formatMoney(120_000_000, { locale: "en-US", currency: "INR", compact: true })).toBe(
      "₹1.2M",
    );
  });
});

describe("minorToDecimalString", () => {
  it("is exact", () => {
    expect(minorToDecimalString(5, 2)).toBe("0.05");
    expect(minorToDecimalString(-105, 2)).toBe("-1.05");
    expect(minorToDecimalString(7, 0)).toBe("7");
  });
});

describe("dates", () => {
  it("formats 20 Nov 2026", () => {
    expect(formatDate("2026-11-20")).toBe("20 Nov 2026");
    expect(formatDate("2026-09-05")).toBe("5 Sep 2026");
    expect(formatDate("2026-09-05", { month: "long" })).toBe("5 September 2026");
    expect(formatDate("2028-02-29", { locale: "en-GB" })).toBe("29 Feb 2028");
  });
  it("uses Intl for other locales", () => {
    expect(formatDate("2026-11-20", { locale: "en-US" })).toBe("Nov 20, 2026");
  });
  it("rejects impossible dates", () => {
    expect(() => parseIsoDate("2026-02-29")).toThrow(RangeError);
    expect(() => parseIsoDate("2026-13-01")).toThrow(RangeError);
    expect(() => formatDate("20/11/2026")).toThrow(RangeError);
  });
  it("counts days across a leap day", () => {
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(daysBetween("2027-02-28", "2027-03-01")).toBe(1);
    expect(daysBetween("2026-11-20", "2026-11-16")).toBe(-4);
  });
  it("formats a month", () => {
    expect(formatMonth(2026, 10)).toBe("Oct 2026");
  });
});

describe("FY and AY labels", () => {
  it("April start (India)", () => {
    expect(fyLabel("2025-04-01")).toBe("FY 2025–26");
    expect(fyLabel("2026-03-31")).toBe("FY 2025–26");
    expect(fyLabel("2026-04-01")).toBe("FY 2026–27");
    expect(ayLabel("2026-03-31")).toBe("AY 2026–27");
    expect(ayLabel(2025)).toBe("AY 2026–27");
    expect(fyLabel(2099)).toBe("FY 2099–00");
  });
  it("configurable start month", () => {
    expect(fyLabel("2026-06-30", { startMonth: 7 })).toBe("FY 2025–26");
    expect(fyLabel("2026-07-01", { startMonth: 7 })).toBe("FY 2026–27");
    expect(fyLabel("2026-12-31", { startMonth: 1 })).toBe("FY 2026");
    expect(fiscalYearStart("2026-01-15")).toBe(2025);
    expect(() => fyLabel("2026-01-01", { startMonth: 13 })).toThrow(RangeError);
  });
});

describe("relative due", () => {
  const today = "2026-11-16";
  const cases: [string, string][] = [
    ["2026-11-16", "today"],
    ["2026-11-17", "tomorrow"],
    ["2026-11-19", "in 3 days"],
    ["2026-11-15", "1 day overdue"],
    ["2026-11-14", "2 days overdue"],
    ["2027-11-16", "in 365 days"],
    ["2025-11-16", "365 days overdue"],
  ];
  it.each(cases)("%s → %s", (due, want) => {
    expect(formatRelativeDue(due, today)).toBe(want);
  });
});

describe("messages", () => {
  it("has due-ladder labels", () => {
    expect(["overdue", "today", "thisWeek", "later", "done"].map((k) => t(`due.${k}`))).toEqual([
      "Overdue",
      "Today",
      "This week",
      "Later",
      "Done",
    ]);
  });
  it("interpolates and formats numbers", () => {
    expect(t("today.summary", { overdue: 3, thisWeek: 5, review: 12 })).toBe(
      "3 overdue, 5 due this week, 12 to review",
    );
    expect(t("relative.inDays", { count: 1200 })).toBe("in 1,200 days");
  });
  it("returns the key when missing and leaves unknown params", () => {
    expect(t("no.such.key")).toBe("no.such.key");
    expect(t("statutory.dataAsOf", {})).toBe("Calendar data as of {date}");
  });
  it("falls back to English", () => {
    const tr = createTranslator({ locale: "hi-IN", catalogue: { "due.today": "आज" } });
    expect(tr("due.today")).toBe("आज");
    expect(tr("due.later")).toBe("Later");
  });
});
