/**
 * Exposure: open demand, computed interest and the penalty range, per client
 * and firm-wide, by tax type and by stage (01 §4). Demands as stated are
 * inputs; computed interest is never stored as a demand (03 §8), so it is a
 * separate input here.
 */
import type { CaseStage } from "@dueproof/contracts";
import { toBig, toSafe } from "./arith";

export type DemandHead = "tax" | "interest" | "penalty" | "fee";
export type DemandStatus = "open" | "paid" | "stayed" | "dropped";

/** One demand line as stated in a notice or order. */
export interface DemandLine {
  clientId: string;
  caseId?: string;
  /** "gst", "income_tax", "tds", … */
  taxType: string;
  stage?: CaseStage;
  head: DemandHead;
  status: DemandStatus;
  amountMinor: number;
}

/** Figures computed by code for a case, to the chosen date. */
export interface ComputedLine {
  clientId: string;
  caseId?: string;
  taxType: string;
  stage?: CaseStage;
  interestMinor?: number;
  penaltyLowMinor?: number;
  penaltyHighMinor?: number;
}

export interface ExposureSubtotal {
  openMinor: number;
  computedInterestMinor: number;
  penaltyLowMinor: number;
  penaltyHighMinor: number;
}

export interface ExposureTotals extends ExposureSubtotal {
  stayedMinor: number;
  paidMinor: number;
  droppedMinor: number;
  /** Open demand by head. */
  openByHead: Record<DemandHead, number>;
  byTaxType: Record<string, ExposureSubtotal>;
  byStage: Record<string, ExposureSubtotal>;
}

export interface Exposure {
  firm: ExposureTotals;
  clients: Record<string, ExposureTotals>;
  /** Clients by open demand plus computed interest, largest first. */
  ranking: { clientId: string; openMinor: number; computedInterestMinor: number }[];
}

interface Acc {
  open: bigint;
  interest: bigint;
  low: bigint;
  high: bigint;
}
interface TotalsAcc extends Acc {
  stayed: bigint;
  paid: bigint;
  dropped: bigint;
  heads: Record<DemandHead, bigint>;
  taxType: Map<string, Acc>;
  stage: Map<string, Acc>;
}

const NO_STAGE = "unstaged";

const acc = (): Acc => ({ open: 0n, interest: 0n, low: 0n, high: 0n });
const totalsAcc = (): TotalsAcc => ({
  ...acc(),
  stayed: 0n,
  paid: 0n,
  dropped: 0n,
  heads: { tax: 0n, interest: 0n, penalty: 0n, fee: 0n },
  taxType: new Map(),
  stage: new Map(),
});

function sub(map: Map<string, Acc>, key: string): Acc {
  let a = map.get(key);
  if (!a) {
    a = acc();
    map.set(key, a);
  }
  return a;
}

function finishSub(a: Acc): ExposureSubtotal {
  return {
    openMinor: toSafe(a.open),
    computedInterestMinor: toSafe(a.interest),
    penaltyLowMinor: toSafe(a.low),
    penaltyHighMinor: toSafe(a.high),
  };
}

function finish(t: TotalsAcc): ExposureTotals {
  const sorted = (m: Map<string, Acc>) =>
    Object.fromEntries(
      [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, finishSub(v)]),
    );
  return {
    ...finishSub(t),
    stayedMinor: toSafe(t.stayed),
    paidMinor: toSafe(t.paid),
    droppedMinor: toSafe(t.dropped),
    openByHead: {
      tax: toSafe(t.heads.tax),
      interest: toSafe(t.heads.interest),
      penalty: toSafe(t.heads.penalty),
      fee: toSafe(t.heads.fee),
    },
    byTaxType: sorted(t.taxType),
    byStage: sorted(t.stage),
  };
}

export function aggregateExposure(
  demands: readonly DemandLine[],
  computed: readonly ComputedLine[] = [],
): Exposure {
  const firm = totalsAcc();
  const clients = new Map<string, TotalsAcc>();
  const client = (id: string) => {
    let c = clients.get(id);
    if (!c) {
      c = totalsAcc();
      clients.set(id, c);
    }
    return c;
  };

  for (const d of demands) {
    const amount = toBig(d.amountMinor, "demand");
    for (const t of [firm, client(d.clientId)]) {
      switch (d.status) {
        case "open": {
          t.open += amount;
          t.heads[d.head] += amount;
          sub(t.taxType, d.taxType).open += amount;
          sub(t.stage, d.stage ?? NO_STAGE).open += amount;
          break;
        }
        case "stayed":
          t.stayed += amount;
          break;
        case "paid":
          t.paid += amount;
          break;
        case "dropped":
          t.dropped += amount;
          break;
      }
    }
  }

  for (const c of computed) {
    const interest = toBig(c.interestMinor ?? 0, "interest");
    const low = toBig(c.penaltyLowMinor ?? 0, "penalty low");
    const high = toBig(c.penaltyHighMinor ?? 0, "penalty high");
    for (const t of [firm, client(c.clientId)]) {
      for (const a of [t, sub(t.taxType, c.taxType), sub(t.stage, c.stage ?? NO_STAGE)]) {
        a.interest += interest;
        a.low += low;
        a.high += high;
      }
    }
  }

  const clientTotals = Object.fromEntries(
    [...clients.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, t]) => [id, finish(t)]),
  );
  const ranking = Object.entries(clientTotals)
    .map(([clientId, t]) => ({
      clientId,
      openMinor: t.openMinor,
      computedInterestMinor: t.computedInterestMinor,
    }))
    .sort(
      (a, b) =>
        b.openMinor + b.computedInterestMinor - (a.openMinor + a.computedInterestMinor) ||
        a.clientId.localeCompare(b.clientId),
    );
  return { firm: finish(firm), clients: clientTotals, ranking };
}
