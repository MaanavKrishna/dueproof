/**
 * The app's use of @dueproof/core, against PGlite: the pipeline's
 * reconcile → resolve dates → write stages honour each finding's deadline
 * policy (auto / after_review / never / none), including AI findings fed
 * through the AI lane's hook; and the statutory calendar regenerates a
 * client's deadlines without touching what a person has finished.
 */
import { reconcile } from "@dueproof/core";
import {
  and,
  clients,
  createDatabase,
  type Database,
  deadlines,
  documents,
  eq,
  evidence,
  findings,
  holidays,
  migrate,
  registrations,
  uuidv7,
  withOrg,
} from "@dueproof/db";
import type { AnalyzeResponse, LinkResponse } from "@dueproof/engine-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type ProvenFinding,
  reconcileStage,
  resolveDatesStage,
  writeStage,
} from "../lib/pipeline/stages";
import type { Container } from "../lib/server/container";
import { regenerateStatutoryDeadlines, statutoryWindow } from "../lib/statutory";

const ORG = "org_core_integration";
let database: Database;
let c: Container;

beforeAll(async () => {
  database = await createDatabase({ driver: "pglite" });
  await migrate(database);
  // Only the database is used by these stages.
  c = { database } as unknown as Container;
});

afterAll(async () => {
  await database.close();
});

const box: [number, number, number, number][] = [[10, 10, 200, 24]];

describe("pipeline deadline policy", () => {
  const documentId = uuidv7();

  it("writes deadlines only for auto findings and leaves the rest for review", async () => {
    await withOrg(database, ORG, async (tx) => {
      // 23 Nov 2026 (receipt + 30 days) is an org holiday: the engine warns, it doesn't move it.
      await tx.insert(holidays).values({ orgId: ORG, day: "2026-11-23", name: "Office closed" });
      await tx.insert(documents).values({
        id: documentId,
        orgId: ORG,
        filename: "notice.pdf",
        mime: "application/pdf",
        sizeBytes: 1,
        sha256: "a".repeat(64),
        storageKey: "k",
        receivedOn: "2026-10-24",
        status: "linking",
      });
    });

    const analysis: AnalyzeResponse = {
      issuedOn: "2026-10-20",
      sections: [],
      confident: true,
      findings: [
        {
          kind: "deadline",
          text: "Reply within 30 days of receipt",
          quote: "within thirty days of receipt of this notice",
          quoteLang: "en",
          confidence: 0.95,
          dueRule: { type: "relative", anchor: "receipt", amount: 30, unit: "days" },
        },
        {
          kind: "obligation",
          text: "Pay the tax by 1 Dec 2026",
          quote: "pay the said amount on or before 1 December 2026",
          quoteLang: "en",
          confidence: 0.8,
          dueRule: { type: "fixed", date: "2026-12-01" },
        },
        {
          kind: "summary",
          text: "Discrepancy in returns",
          quote: "discrepancies noticed in the return filed for the period",
          quoteLang: "en",
          confidence: 0.9,
        },
      ],
    };
    const link: LinkResponse = {
      matches: [
        { id: "q0", page: 1, rects: box, score: 1, grade: "exact" },
        { id: "q1", rects: [], score: 0.1, grade: "unlocated" },
        { id: "q2", page: 1, rects: box, score: 0.97, grade: "strong" },
      ],
    };
    const ai: ProvenFinding[] = [
      {
        // Agrees with the rules' summary.
        id: "ai0",
        finding: {
          ...(analysis.findings[2] as AnalyzeResponse["findings"][number]),
          confidence: 0.7,
        },
        grade: "exact",
        page: 1,
        rects: box,
        score: 1,
      },
      {
        // AI only, located: the organisation's first, so it needs review.
        id: "ai1",
        finding: {
          kind: "hearing",
          text: "Personal hearing on 4 Dec 2026",
          quote: "personal hearing on 4 December 2026 at 11 am",
          quoteLang: "en",
          confidence: 0.85,
          dueRule: { type: "fixed", date: "2026-12-04" },
        },
        grade: "approximate",
        page: 1,
        rects: box,
        score: 0.8,
      },
      {
        // AI only, not on the page: an unverified suggestion, never a deadline.
        id: "ai2",
        finding: {
          kind: "deadline",
          text: "File appeal by 10 Jan 2027",
          quote: "appeal may be filed by 10 January 2027",
          quoteLang: "en",
          confidence: 0.6,
          dueRule: { type: "fixed", date: "2027-01-10" },
        },
        grade: "unlocated",
        rects: [],
        score: 0,
      },
    ];
    const ref = { orgId: ORG, documentId };

    const reconciled = await reconcileStage(c, ref, analysis, link, ai);
    expect(reconciled.findings.map((f) => [f.id, f.origin, f.grade, f.status, f.deadline])).toEqual(
      [
        ["q0", "rule", "exact", "verified", "auto"],
        ["q1", "rule", "unlocated", "needs_review", "after_review"],
        ["q2", "rule+ai", "exact", "verified", "none"],
        ["ai1", "ai", "approximate", "verified", "after_review"],
        ["ai2", "ai", "unlocated", "unverified", "never"],
      ],
    );
    expect(reconciled.aiFirstNUsed).toBe(1);

    const dates = await resolveDatesStage(c, ref, reconciled, analysis.issuedOn);
    expect(dates.map((d) => d.id)).toEqual(["q0"]);

    const written = await writeStage(c, ref, analysis, reconciled, dates, []);
    expect(written).toMatchObject({ status: "needs_review", findings: 5, deadlines: 1 });

    const rows = await withOrg(database, ORG, async (tx) => ({
      found: await tx
        .select()
        .from(findings)
        .where(and(eq(findings.orgId, ORG), eq(findings.documentId, documentId)))
        .orderBy(findings.ord),
      proof: await tx.select().from(evidence).where(eq(evidence.documentId, documentId)),
      due: await tx.select().from(deadlines).where(eq(deadlines.orgId, ORG)),
    }));
    expect(rows.found.map((f) => [f.origin, f.verification])).toEqual([
      ["rule", "exact"],
      ["rule", "unlocated"],
      ["rule+ai", "exact"],
      ["ai", "approximate"],
      ["ai", "unlocated"],
    ]);
    // Evidence only for located findings.
    expect(rows.proof).toHaveLength(3);
    expect(rows.due).toHaveLength(1);
    const [d] = rows.due;
    expect(d).toMatchObject({
      source: "notice",
      dueOn: "2026-11-23",
      basis: "30 days from receipt on 24 Oct 2026",
      windowEndOn: null,
      rule: { type: "relative", anchor: "receipt", amount: 30, unit: "days" },
      detail: { adjustments: [], origin: "rule", verification: "exact" },
    });
    expect((d?.detail as { warnings?: string[] } | undefined)?.warnings?.join(" ")).toMatch(
      /holiday/i,
    );

    // A retry after the commit writes nothing twice.
    const again = await writeStage(c, ref, analysis, reconciled, dates, []);
    expect(again).toMatchObject({ skipped: true });
  });

  it("counts the organisation's earlier AI findings towards the first N", async () => {
    const documentId2 = uuidv7();
    await withOrg(database, ORG, (tx) =>
      tx.insert(documents).values({
        id: documentId2,
        orgId: ORG,
        filename: "second.pdf",
        mime: "application/pdf",
        sizeBytes: 1,
        sha256: "b".repeat(64),
        storageKey: "k2",
        receivedOn: "2026-10-24",
      }),
    );
    const ai: ProvenFinding = {
      id: "ai0",
      finding: {
        kind: "hearing",
        text: "Hearing on 8 Dec 2026",
        quote: "hearing fixed on 8 December 2026",
        quoteLang: "en",
        confidence: 0.9,
        dueRule: { type: "fixed", date: "2026-12-08" },
      },
      grade: "exact",
      page: 1,
      rects: box,
      score: 1,
    };
    const analysis: AnalyzeResponse = { sections: [], confident: true, findings: [] };
    const ref = { orgId: ORG, documentId: documentId2 };
    // One AI-only located finding is already written: still within the default first 25.
    const first = await reconcileStage(c, ref, analysis, { matches: [] }, [ai]);
    expect(first.findings[0]?.deadline).toBe("after_review");
    // Past the first N, a located AI-only date becomes a deadline on its own.
    const pastN = reconcile([], [ai], { aiReviewedSoFar: 1, reviewFirstN: 1 });
    expect(pastN.findings[0]?.deadline).toBe("auto");
  });
});

describe("statutory calendar", () => {
  const clientId = uuidv7();

  it("upserts a client's statutory deadlines for the rolling window", async () => {
    await withOrg(database, ORG, async (tx) => {
      await tx.insert(clients).values({ id: clientId, orgId: ORG, name: "Harbour Traders" });
      await tx.insert(registrations).values({
        id: uuidv7(),
        orgId: ORG,
        clientId,
        kind: "gst",
        identifier: "32ABCDE1234F1Z5",
        frequency: "monthly",
        attributes: {},
      });
    });
    const today = "2026-11-16";
    expect(statutoryWindow(today)).toEqual({ from: "2026-10-16", to: "2028-02-16" });

    const first = await regenerateStatutoryDeadlines(database, ORG, clientId, { today });
    expect(first.items).toBeGreaterThan(20);
    expect(first).toMatchObject({ inserted: first.items, updated: 0, kept: 0, removed: 0 });

    const rows = await statutoryRows(clientId);
    expect(rows).toHaveLength(first.items);
    const nov = rows.find((r) => r.statutoryKey === "in.gst.gstr3b.monthly:2026-10");
    expect(nov).toMatchObject({
      source: "statutory",
      dueOn: "2026-11-20",
      rule: { type: "statutory", ruleKey: "in.gst.gstr3b.monthly", period: "2026-10" },
      status: "open",
      detail: { statutory: { form: "GSTR-3B", verified: false } },
    });
    expect(nov?.basis).toBeTruthy();
    expect(rows.every((r) => r.dueOn >= "2026-10-16" && r.dueOn <= "2028-02-16")).toBe(true);

    // Again: nothing new, every row updated in place.
    const second = await regenerateStatutoryDeadlines(database, ORG, clientId, { today });
    expect(second).toMatchObject({ inserted: 0, updated: first.items, kept: 0, removed: 0 });
    expect(await statutoryRows(clientId)).toHaveLength(first.items);
  });

  it("never touches a row a person marked done, and removes what no longer applies", async () => {
    const today = "2026-11-16";
    const key = "in.gst.gstr3b.monthly:2026-10";
    await withOrg(database, ORG, (tx) =>
      tx
        .update(deadlines)
        .set({ status: "done", completedAt: new Date(), basis: "Filed on 18 Nov" })
        .where(and(eq(deadlines.orgId, ORG), eq(deadlines.statutoryKey, key))),
    );
    // The client moves to quarterly (QRMP): the monthly rows no longer apply.
    await withOrg(database, ORG, (tx) =>
      tx
        .update(registrations)
        .set({ frequency: "quarterly", scheme: "qrmp" })
        .where(and(eq(registrations.orgId, ORG), eq(registrations.clientId, clientId))),
    );
    const res = await regenerateStatutoryDeadlines(database, ORG, clientId, { today });
    expect(res.removed).toBeGreaterThan(0);

    const rows = await statutoryRows(clientId);
    const done = rows.find((r) => r.statutoryKey === key);
    expect(done).toMatchObject({ status: "done", basis: "Filed on 18 Nov" });
    const monthlyOpen = rows.filter(
      (r) => r.status === "open" && r.statutoryKey?.includes(".monthly:"),
    );
    expect(monthlyOpen).toEqual([]);
    expect(rows.some((r) => r.statutoryKey?.startsWith("in.gst.gstr3b.qrmp"))).toBe(true);
  });

  it("refuses a client of another organisation", async () => {
    await expect(
      regenerateStatutoryDeadlines(database, "org_other", clientId, { today: "2026-11-16" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

async function statutoryRows(clientId: string) {
  return withOrg(database, ORG, (tx) =>
    tx
      .select()
      .from(deadlines)
      .where(
        and(
          eq(deadlines.orgId, ORG),
          eq(deadlines.clientId, clientId),
          eq(deadlines.source, "statutory"),
        ),
      ),
  );
}
