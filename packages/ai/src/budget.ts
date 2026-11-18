/**
 * The monthly AI budget, held across documents processed at the same time.
 *
 * Reading "spent so far" once per document (policy.usage) lets two documents
 * started together each see the same figure and both spend up to the cap.
 * A ledger fixes that: before each call, `reserve` the call's upper-bound
 * estimate; the reservation and the check are one atomic step, so the sum of
 * what is spent and what is reserved never exceeds the cap. After the call,
 * `settle` the reservation with the call's actual cost (or 0 if it was not
 * made).
 *
 * `memoryBudgetLedger` is atomic within one process (the check and the add
 * run with no await between them). Across processes or machines the ledger
 * must live in the database: see `BudgetLedger`.
 */

export interface BudgetReservation {
  /** µ$ held for one call until it is settled. */
  readonly amount: number;
}

export interface BudgetLedger {
  /**
   * Atomically check that `estimate` more µ$ fits under the cap, counting
   * everything spent and everything still reserved, and if it does, hold it.
   * Null when it does not fit (the call must not be made).
   *
   * A database ledger does this in one transaction: lock the organisation's
   * budget row (`SELECT … FOR UPDATE`), add this month's `ai_runs` spend to
   * the open reservations, compare with the cap, and insert the reservation.
   */
  reserve(estimate: number): Promise<BudgetReservation | null>;
  /** Release a reservation, recording what the call actually cost (0 if it was not made). */
  settle(reservation: BudgetReservation, actualMicroUsd: number): Promise<void>;
}

export interface MemoryBudgetLedger extends BudgetLedger {
  /** Spent and settled, µ$. */
  readonly spent: number;
  /** Held by reservations not yet settled, µ$. */
  readonly reserved: number;
}

/**
 * A ledger in this process's memory. `capMicroUsd` null means no cap (every
 * reservation succeeds, spend is still counted). `spentMicroUsd` is this
 * month's spend so far (e.g. `policy.usage.spentMicroUsdThisMonth`).
 */
export function memoryBudgetLedger(
  capMicroUsd: number | null,
  spentMicroUsd: number,
): MemoryBudgetLedger {
  let spent = Math.max(0, spentMicroUsd);
  let reserved = 0;
  const open = new Set<BudgetReservation>();
  return {
    get spent() {
      return spent;
    },
    get reserved() {
      return reserved;
    },
    async reserve(estimate) {
      // No await before the check and the add: atomic within the process.
      const amount = Number.isFinite(estimate) && estimate > 0 ? Math.ceil(estimate) : 0;
      if (capMicroUsd !== null && spent + reserved + amount > capMicroUsd) return null;
      const r: BudgetReservation = { amount };
      open.add(r);
      reserved += amount;
      return r;
    },
    async settle(r, actual) {
      if (!open.delete(r)) return; // settled already, or not ours
      reserved -= r.amount;
      spent += Number.isFinite(actual) && actual > 0 ? actual : 0;
    },
  };
}
