import { linkQuotes } from "@dueproof/engine-client";
import { describe, expect, it } from "vitest";
import { type BudgetLedger, memoryBudgetLedger } from "./budget";
import { type AssistInput, assistExtraction } from "./extract";
import { summarise } from "./features";
import { createFakeProvider } from "./providers/fake";
import { gradedRuleFindings, loadEngineRecording, testPolicy } from "./testing/fixtures";

const asmt = loadEngineRecording("notice-gst-asmt10");
const pages = asmt.read.pages;

const input = (documentId: string): AssistInput => ({
  documentId,
  pages,
  analyze: { confident: false, docType: "GST notice" },
  ruleFindings: gradedRuleFindings(asmt),
  link: async (quotes) => linkQuotes({ pages: [...pages], quotes }),
});

/** A ledger that records every estimate it is asked to reserve. */
function spyLedger(inner: BudgetLedger): BudgetLedger & { estimates: number[]; settled: number } {
  const estimates: number[] = [];
  let settled = 0;
  return {
    estimates,
    get settled() {
      return settled;
    },
    async reserve(e) {
      estimates.push(e);
      return inner.reserve(e);
    },
    async settle(r, actual) {
      settled++;
      return inner.settle(r, actual);
    },
  };
}

describe("memoryBudgetLedger", () => {
  it("never lets spent + reserved pass the cap, however many reserve at once", async () => {
    const ledger = memoryBudgetLedger(1_000, 100);
    const got = await Promise.all(Array.from({ length: 50 }, () => ledger.reserve(100)));
    expect(got.filter(Boolean)).toHaveLength(9);
    expect(ledger.reserved).toBe(900);
    expect(ledger.spent + ledger.reserved).toBeLessThanOrEqual(1_000);
    // Settling at a lower actual cost frees the difference.
    const first = got[0];
    if (!first) throw new Error("expected a reservation");
    await ledger.settle(first, 40);
    expect(ledger.spent).toBe(140);
    expect(ledger.reserved).toBe(800);
    // Settling twice does nothing.
    await ledger.settle(first, 40);
    expect(ledger.spent).toBe(140);
    expect(await ledger.reserve(60)).not.toBeNull();
    expect(await ledger.reserve(1)).toBeNull();
  });

  it("with no cap, always reserves and still counts spend; bad numbers count as 0", async () => {
    const ledger = memoryBudgetLedger(null, 0);
    const r = await ledger.reserve(Number.NaN);
    expect(r).toEqual({ amount: 0 });
    if (r) await ledger.settle(r, -5);
    expect(ledger.spent).toBe(0);
    const big = await ledger.reserve(1e12);
    if (big) await ledger.settle(big, 1e6);
    expect(ledger.spent).toBe(1e6);
  });
});

describe("the budget across documents processed at the same time (M7)", () => {
  async function estimateOfOneCall(): Promise<number> {
    const spy = spyLedger(memoryBudgetLedger(null, 0));
    await assistExtraction(input("probe"), testPolicy({}, createFakeProvider()), { budget: spy });
    const e = spy.estimates[0];
    if (e === undefined) throw new Error("no call made");
    return e;
  }

  it("without a shared ledger, two documents both spend the room for one (the bug)", async () => {
    const one = await estimateOfOneCall();
    const fake = createFakeProvider();
    const policy = testPolicy(
      {
        monthlyBudgetMicroUsd: Math.floor(one * 1.5),
        usage: { aiCallsThisMonth: 10, opusCallsThisMonth: 0, spentMicroUsdThisMonth: 0 },
      },
      fake,
    );
    await Promise.all([assistExtraction(input("a"), policy), assistExtraction(input("b"), policy)]);
    expect(fake.calls).toHaveLength(2);
  });

  it("with a shared ledger, only one of them is called; the other stops for review", async () => {
    const one = await estimateOfOneCall();
    const fake = createFakeProvider();
    const cap = Math.floor(one * 1.5);
    const policy = testPolicy(
      {
        monthlyBudgetMicroUsd: cap,
        usage: { aiCallsThisMonth: 10, opusCallsThisMonth: 0, spentMicroUsdThisMonth: 0 },
      },
      fake,
    );
    const ledger = spyLedger(memoryBudgetLedger(cap, 0));
    const results = await Promise.all([
      assistExtraction(input("a"), policy, { budget: ledger }),
      assistExtraction(input("b"), policy, { budget: ledger }),
    ]);
    expect(fake.calls).toHaveLength(1);
    expect(results.map((r) => r.stoppedBy ?? "called").sort()).toEqual([
      "budget_exceeded",
      "called",
    ]);
    const stopped = results.find((r) => r.stoppedBy === "budget_exceeded");
    expect(stopped?.needsReview).toBe(true);
    // Every reservation that was granted was settled.
    expect(ledger.settled).toBe(1);
  });

  it("settles the reservation even when the provider fails", async () => {
    const fake = createFakeProvider({ fail: () => new Error("down") });
    const ledger = memoryBudgetLedger(10_000_000, 0);
    await assistExtraction(input("a"), testPolicy({}, fake), { budget: ledger, maxCalls: 1 });
    expect(ledger.reserved).toBe(0);
  });

  it("features reserve through the same ledger", async () => {
    const fake = createFakeProvider();
    const ledger = memoryBudgetLedger(0, 0);
    const r = await summarise({ findings: [] }, testPolicy({}, fake), { budget: ledger });
    expect(r.skipped).toBe("budget_exceeded");
    expect(fake.calls).toHaveLength(0);
  });
});

describe("a model with no price (M7)", () => {
  const unpriced = { haiku: "gpt-5", sonnet: "gpt-5", opus: "gpt-5" };

  it("is held by the monthly budget instead of counting as free", async () => {
    const fake = createFakeProvider();
    const r = await assistExtraction(
      input("a"),
      testPolicy(
        {
          mode: "byok",
          models: unpriced,
          monthlyBudgetMicroUsd: 100_000, // 10 US cents
          usage: { aiCallsThisMonth: 10, opusCallsThisMonth: 0, spentMicroUsdThisMonth: 0 },
        },
        fake,
      ),
    );
    expect(fake.calls).toHaveLength(0);
    expect(r.stoppedBy).toBe("budget_exceeded");
  });

  it("is recorded at a conservative cost, so later calls see the spend", async () => {
    const fake = createFakeProvider();
    const r = await assistExtraction(
      input("a"),
      testPolicy({ mode: "byok", models: unpriced }, fake),
    );
    expect(r.runs[0]?.costMicroUsd).toBeGreaterThan(0);
  });

  it("costs nothing in local mode", async () => {
    const fake = createFakeProvider();
    const r = await assistExtraction(
      input("a"),
      testPolicy(
        {
          mode: "local",
          models: { haiku: "qwen3", sonnet: "qwen3", opus: "qwen3" },
          monthlyBudgetMicroUsd: 0,
        },
        fake,
      ),
    );
    expect(fake.calls).toHaveLength(1);
    expect(r.runs[0]?.costMicroUsd).toBe(0);
  });
});
