/**
 * Pure pieces of Deadlines, Clients, Reports and PWA: CSV import
 * validation, week grouping and filters, the iCal token and feed, CSV
 * export escaping, the digest email, push subscription checks and the
 * install's VAPID key pair.
 */
import { createECDH } from "node:crypto";
import { checkGstin, gstinCheckCharacter } from "@dueproof/core";
import { describe, expect, it } from "vitest";
import {
  guessMapping,
  normalisePhone,
  parseDelimited,
  validateImport,
} from "../features/clients/csv-import";
import { applyFilters, groupByWeek, mondayOf, weekRange } from "../features/deadlines/group";
import {
  esc,
  FEED_TOKEN_MAX_AGE_MS,
  renderIcs,
  signFeedToken,
  verifyFeedToken,
} from "../features/deadlines/ical";
import { validSubscription } from "../features/push/validate";
import { renderDigest } from "../features/reminders/digest";
import { csvCell, rupees, toCsv } from "../lib/csv";
import type { DeadlineRow } from "../lib/deadline-rows";
import { parseEnv } from "../lib/env";
import { vapidKeys } from "../lib/push";

const gstin = (first14: string) => `${first14}${gstinCheckCharacter(first14)}`;
const GOOD = gstin("27AAACH1234A1Z");
const OTHER = gstin("29AAJFK3456Q1Z");

describe("CSV import", () => {
  it("parses quoted CSV, semicolons and pasted tab-separated rows", () => {
    expect(parseDelimited('Name,GSTIN\n"Harbour, Valley ""Foods""",X\r\n\nB,Y')).toEqual([
      ["Name", "GSTIN"],
      ['Harbour, Valley "Foods"', "X"],
      ["B", "Y"],
    ]);
    expect(parseDelimited("Name\tPAN\nA\tAAAPA1234A")).toEqual([
      ["Name", "PAN"],
      ["A", "AAAPA1234A"],
    ]);
    expect(parseDelimited("﻿Name;PAN\nA;B")[0]).toEqual(["Name", "PAN"]);
  });

  it("guesses the column mapping from Tally- and Zoho-style headers", () => {
    const m = guessMapping([
      "Party Name",
      "GSTIN/UIN",
      "PAN No",
      "Mobile",
      "E-mail",
      "Filing frequency",
    ]);
    expect(m).toMatchObject({
      name: 0,
      gstin: 1,
      pan: 2,
      contactPhone: 3,
      contactEmail: 4,
      gstFrequency: 5,
      cin: -1,
    });
  });

  it("validates GSTIN check characters and PAN shape, and keeps good rows", () => {
    const wrong = `${GOOD.slice(0, 14)}${GOOD[14] === "A" ? "B" : "A"}`;
    const rows = [
      ["Harbour Valley Foods", GOOD, "", "monthly", "9876543210"],
      ["Bad GSTIN Ltd", wrong, "", "", ""],
      ["Bad PAN & Co", "", "AAAX1234", "", ""],
      ["", OTHER, "", "", ""],
      ["Kaveri Agro", OTHER, "AAACH1234A", "quarterly", ""],
      ["Odd frequency", "", "", "weekly", ""],
    ];
    const mapping = {
      ...guessMapping([]),
      name: 0,
      gstin: 1,
      pan: 2,
      gstFrequency: 3,
      contactPhone: 4,
    };
    const v = validateImport(rows, mapping);
    expect(v.rows.map((r) => r.name)).toEqual(["Harbour Valley Foods"]);
    expect(v.rows[0]).toMatchObject({
      pan: "AAACH1234A",
      gstins: [GOOD],
      gstFrequency: "monthly",
      contact: { phone: "+919876543210" },
    });
    expect(v.skipped).toBe(5);
    const by = (line: number) => v.issues.filter((i) => i.line === line).map((i) => i.field);
    expect(by(3)).toEqual(["gstin"]);
    expect(v.issues.find((i) => i.line === 3)?.message).toMatch(/check character/);
    expect(by(4)).toEqual(["pan"]);
    expect(by(5)).toEqual(["name"]);
    expect(by(6)).toEqual(["gstin"]); // the GSTIN doesn't contain the row's PAN
    expect(by(7)).toEqual(["gstFrequency"]);
    expect(checkGstin(GOOD).ok).toBe(true);
  });

  it("normalises Indian phone numbers", () => {
    expect(normalisePhone("098765 43210")).toBe("+919876543210");
    expect(normalisePhone("+91 98765 43210")).toBe("+919876543210");
  });
});

function row(p: Partial<DeadlineRow> & { id: string; dueOn: string }): DeadlineRow {
  return {
    title: p.id,
    windowEndOn: null,
    windowBasis: null,
    basis: "basis",
    source: "statutory",
    type: "gst",
    status: "open",
    state: "later",
    ownerUserId: null,
    clientId: "c1",
    clientName: "Client",
    caseId: null,
    caseTitle: null,
    findingId: null,
    completedAt: null,
    snoozedUntil: null,
    ackNumber: null,
    adjustments: [],
    warnings: [],
    statutory: null,
    ...p,
  };
}

describe("deadline list", () => {
  const today = "2026-11-16"; // a Monday
  it("groups by week with overdue first", () => {
    const groups = groupByWeek(
      [
        row({ id: "late", dueOn: "2026-11-10" }),
        row({ id: "thu", dueOn: "2026-11-19" }),
        row({ id: "next", dueOn: "2026-11-24" }),
        row({ id: "dec", dueOn: "2026-12-07" }),
      ],
      today,
    );
    expect(groups.map((g) => [g.label, g.rows.map((r) => r.id)])).toEqual([
      ["Overdue", ["late"]],
      ["This week", ["thu"]],
      ["Next week", ["next"]],
      ["Week of 7 Dec", ["dec"]],
    ]);
    expect(mondayOf("2026-11-22")).toBe("2026-11-16");
    expect(weekRange("2026-11-30")).toBe("30 Nov – 6 Dec 2026");
  });

  it("filters by client, person, source and status, with snoozed items apart", () => {
    const rows = [
      row({ id: "a", dueOn: "2026-11-20", ownerUserId: "u1" }),
      row({ id: "b", dueOn: "2026-11-20", source: "notice", clientId: "c2" }),
      row({ id: "c", dueOn: "2026-11-20", snoozedUntil: "2026-11-18" }),
      row({ id: "d", dueOn: "2026-11-20", status: "done" }),
    ];
    const ids = (f: Record<string, string[]>) => applyFilters(rows, f, today).map((r) => r.id);
    expect(ids({})).toEqual(["a", "b"]);
    expect(ids({ status: ["snoozed"] })).toEqual(["c"]);
    expect(ids({ status: ["done", "open"] })).toEqual(["a", "b", "d"]);
    expect(ids({ person: ["none"] })).toEqual(["b"]);
    expect(ids({ client: ["c2"], source: ["notice"] })).toEqual(["b"]);
  });
});

describe("calendar feed", () => {
  const secret = "s".repeat(40);
  it("signs and verifies a per-user token, and refuses a changed one", () => {
    const t = signFeedToken(secret, {
      orgId: "org_1",
      userId: "u_1",
      scope: "me",
      issuedAt: 1_700_000_000_000,
    });
    // Checked as of a minute after issue: tokens now expire (I2).
    const at = 1_700_000_060_000;
    expect(verifyFeedToken(secret, t, at)).toEqual({
      orgId: "org_1",
      userId: "u_1",
      scope: "me",
      issuedAt: 1_700_000_000_000,
    });
    expect(verifyFeedToken("x".repeat(40), t, at)).toBeNull();
    const [payload, mac] = t.split(".") as [string, string];
    const forged = Buffer.from(
      Buffer.from(payload, "base64url").toString().replace("u_1", "u_2"),
    ).toString("base64url");
    expect(verifyFeedToken(secret, `${forged}.${mac}`, at)).toBeNull();
    expect(verifyFeedToken(secret, "garbage", at)).toBeNull();
    expect(verifyFeedToken(secret, `${t}.extra`, at)).toBeNull();
  });

  it("expires a token a year after issue, and refuses one from the future (I2)", () => {
    const issuedAt = 1_700_000_000_000;
    const t = signFeedToken(secret, { orgId: "o", userId: "u", scope: "org", issuedAt });
    expect(verifyFeedToken(secret, t, issuedAt + FEED_TOKEN_MAX_AGE_MS)).not.toBeNull();
    expect(verifyFeedToken(secret, t, issuedAt + FEED_TOKEN_MAX_AGE_MS + 1)).toBeNull();
    expect(verifyFeedToken(secret, t, issuedAt - 60 * 60 * 1000)).toBeNull();
  });

  it("escapes every line break, a lone CR included, and drops control characters (I2)", () => {
    expect(esc("a\rb")).toBe("a\\nb");
    expect(esc("a\r\nb\nc")).toBe("a\\nb\\nc");
    expect(esc("x\u0000y\u0007z\u007f")).toBe("xyz");
    const ics = renderIcs("F", [{ id: "d", title: "Pay\rEND:VEVENT", date: "2026-11-20" }]);
    expect(ics).toContain("SUMMARY:Pay\\nEND:VEVENT\r\n");
    expect(ics.split("\r\n").filter((l) => l === "END:VEVENT")).toHaveLength(1);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("renders all-day events with escaping and folded lines", () => {
    const ics = renderIcs(
      "Feed",
      [{ id: "d1", title: "GSTR-3B; Oct, 2026", date: "2026-11-20", description: "x".repeat(120) }],
      new Date("2026-11-16T00:00:00Z"),
    );
    expect(ics).toContain("DTSTART;VALUE=DATE:20261120\r\nDTEND;VALUE=DATE:20261121");
    expect(ics).toContain("SUMMARY:GSTR-3B\\; Oct\\, 2026");
    expect(ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  });
});

describe("CSV export", () => {
  it("quotes, escapes and defuses formulas", () => {
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell(-5)).toBe("-5");
    expect(rupees(45230012)).toBe("452300.12");
    expect(toCsv(["A"], [["x"]])).toBe("﻿A\r\nx\r\n");
  });
});

describe("digest", () => {
  it("lists overdue, today, this week and approvals, and escapes", () => {
    const d = renderDigest({
      orgName: "Mehta <Iyer>",
      personName: "Asha Rao",
      today: "2026-11-16",
      appUrl: "http://localhost:3000",
      overdue: [row({ id: "o", title: "GSTR-3B · Oct 2026", dueOn: "2026-11-10" })],
      dueToday: [],
      thisWeek: [row({ id: "w", title: "TDS payment", dueOn: "2026-11-20" })],
      awaitingApproval: [{ id: "k", title: "Reply to ASMT-10", clientName: null }],
    });
    expect(d.empty).toBe(false);
    expect(d.subject).toBe("Dueproof · 16 Nov: 1 overdue, 1 this week, 1 to approve");
    expect(d.html).toContain("Mehta &lt;Iyer&gt;");
    expect(d.html).toContain("Good morning, Asha");
    expect(d.text).toContain("- TDS payment · Client (due 20 Nov)");
    expect(
      renderDigest({
        ...{ orgName: "x", personName: "y", today: "2026-11-16", appUrl: "http://a" },
        overdue: [],
        dueToday: [],
        thisWeek: [],
        awaitingApproval: [],
      }).empty,
    ).toBe(true);
  });
});

describe("web push", () => {
  it("accepts a real subscription and refuses odd ones", () => {
    const keys = {
      p256dh:
        "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
      auth: "tBHItJI5svbpez7KI4CCXg",
    };
    expect(
      validSubscription({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys }).endpoint,
    ).toBe("https://fcm.googleapis.com/fcm/send/abc");
    expect(() => validSubscription({ endpoint: "http://fcm.googleapis.com/x", keys })).toThrow(
      /https/,
    );
    expect(() => validSubscription({ endpoint: "https://127.0.0.1/x", keys })).toThrow(/allowed/);
    expect(() =>
      validSubscription({
        endpoint: "https://fcm.googleapis.com/fcm/send/x",
        keys: { p256dh: "a b", auth: "x" },
      }),
    ).toThrow(/keys/);
    expect(() => validSubscription(null)).toThrow();
  });

  it("allows only the browsers' push services (security review L2)", () => {
    const keys = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2", auth: "tBHItJI5svbpez7KI4CCXg" };
    for (const ok of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/QGx",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
    ]) {
      expect(validSubscription({ endpoint: ok, keys }).endpoint).toBe(ok);
    }
    for (const bad of [
      "https://172.16.0.1/x",
      "https://0.0.0.0/x",
      "https://100.64.0.1/x",
      "https://[fd00::1]/x",
      "https://[::ffff:10.0.0.1]/x",
      "https://metadata.google.internal/x",
      "https://push.example/x",
      "https://fcm.googleapis.com.evil.test/x",
      "https://evilfcm.googleapis.com.test/x",
      "https://fcm.googleapis.com:8443/x",
      "https://user@fcm.googleapis.com/x",
    ]) {
      expect(() => validSubscription({ endpoint: bad, keys }), bad).toThrow(/allowed/);
    }
  });

  it("derives a stable P-256 VAPID pair from AUTH_SECRET unless keys are set", () => {
    const env = parseEnv({ AUTH_SECRET: "v".repeat(40) });
    const a = vapidKeys(env);
    expect(vapidKeys(env)).toEqual(a);
    expect(Buffer.from(a.publicKey, "base64url")).toHaveLength(65);
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(Buffer.from(a.privateKey, "base64url"));
    expect(ecdh.getPublicKey().toString("base64url")).toBe(a.publicKey);
    expect(vapidKeys(parseEnv({ AUTH_SECRET: "w".repeat(40) })).publicKey).not.toBe(a.publicKey);
    expect(
      vapidKeys(
        parseEnv({
          AUTH_SECRET: "v".repeat(40),
          VAPID_PUBLIC_KEY: "pub",
          VAPID_PRIVATE_KEY: "priv",
        }),
      ),
    ).toMatchObject({ publicKey: "pub", privateKey: "priv" });
  });
});
