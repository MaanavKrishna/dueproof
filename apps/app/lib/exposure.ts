/**
 * Exposure read model (01 §4): demands as stated, interest computed by
 * `@dueproof/core` to an as-of date with its workings, and penalty as a
 * range, aggregated per client and firm-wide by `aggregateExposure`. Every
 * figure is an estimate from the stated inputs, not advice. Runs inside the
 * caller's `withOrg` transaction.
 */
import "server-only";
import {
  aggregateExposure,
  type CalcResult,
  type ComputedLine,
  type DemandLine,
  dailyInterest,
  type Exposure,
  interest234A,
  interest234B,
  penaltyRange,
  type Step,
} from "@dueproof/core";
import { and, cases, clients, demands, eq, inArray, type OrgTx } from "@dueproof/db";

export interface WorkingsView {
  demandId: string;
  caseId: string;
  caseTitle: string;
  clientId: string | null;
  /** "Interest under CGST Act s.50(1)". */
  title: string;
  steps: Step[];
  amountMinor: number;
  verified: boolean;
  citation: string;
  warnings: string[];
}

export interface DemandView {
  id: string;
  caseId: string;
  caseTitle: string;
  clientId: string | null;
  taxType: string;
  head: "tax" | "interest" | "penalty" | "fee";
  status: "open" | "paid" | "stayed" | "dropped";
  principalMinor: number;
  interestMinor: number;
  penaltyLowMinor: number;
  penaltyHighMinor: number;
}

export interface ExposureView {
  asOf: string;
  exposure: Exposure;
  demands: DemandView[];
  workings: WorkingsView[];
  /** Client names for the firm-wide rows. */
  clientNames: Record<string, string>;
}

type Inputs = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/** Interest for one demand line from its stored rule and inputs, or null when it can't be computed. */
export function interestFor(
  rule: string | null,
  principalMinor: number,
  inputs: Inputs,
  asOf: string,
): CalcResult | null {
  try {
    switch (rule) {
      case "in.gst.s50.1":
      case "in.gst.s50.3": {
        const dueOn = str(inputs.dueOn);
        if (!dueOn) return null;
        return dailyInterest({
          ruleKey: rule,
          taxMinor: num(inputs.taxMinor) ?? principalMinor,
          dueOn,
          paidOn: str(inputs.paidOn) ?? asOf,
        });
      }
      case "in.it.s234a": {
        const dueOn = str(inputs.dueOn);
        if (!dueOn) return null;
        return interest234A({
          taxMinor: num(inputs.taxMinor) ?? principalMinor,
          dueOn,
          filedOn: str(inputs.filedOn) ?? asOf,
        });
      }
      case "in.it.s234b": {
        const fy = str(inputs.fy);
        if (!fy) return null;
        return interest234B({
          assessedTaxMinor: num(inputs.assessedTaxMinor) ?? principalMinor,
          advanceTaxPaidMinor: num(inputs.advanceTaxPaidMinor) ?? 0,
          fy,
          untilOn: str(inputs.untilOn) ?? asOf,
        });
      }
      default:
        return null;
    }
  } catch {
    // Bad stored inputs: show the demand without an estimate rather than fail the page.
    return null;
  }
}

export async function loadExposure(
  tx: OrgTx,
  orgId: string,
  asOf: string,
  filter: { clientIds?: string[]; caseIds?: string[]; scope?: readonly string[] | undefined } = {},
): Promise<ExposureView> {
  const where = [eq(demands.orgId, orgId)];
  if (filter.clientIds?.length) where.push(inArray(demands.clientId, filter.clientIds));
  if (filter.caseIds?.length) where.push(inArray(demands.caseId, filter.caseIds));
  // Client-level access: a restricted person sees exposure only for their clients.
  if (filter.scope)
    where.push(inArray(demands.clientId, filter.scope.length ? [...filter.scope] : [""]));
  const rows = await tx
    .select({
      d: demands,
      caseTitle: cases.title,
      stage: cases.stage,
      caseClientId: cases.clientId,
      clientName: clients.name,
    })
    .from(demands)
    .leftJoin(cases, and(eq(cases.orgId, demands.orgId), eq(cases.id, demands.caseId)))
    .leftJoin(clients, and(eq(clients.orgId, demands.orgId), eq(clients.id, demands.clientId)))
    .where(and(...where));

  const lines: DemandLine[] = [];
  const computed: ComputedLine[] = [];
  const views: DemandView[] = [];
  const workings: WorkingsView[] = [];
  const clientNames: Record<string, string> = {};

  for (const { d, caseTitle, stage, caseClientId, clientName } of rows) {
    const clientId = d.clientId ?? caseClientId ?? "unassigned";
    if (clientName) clientNames[clientId] = clientName;
    const base = {
      clientId,
      caseId: d.caseId,
      taxType: d.taxType,
      ...(stage ? { stage } : {}),
    };
    lines.push({ ...base, head: d.head, status: d.status, amountMinor: d.principalMinor });

    let interestMinor = 0;
    let low = 0;
    let high = 0;
    const inputs = (d.inputs ?? {}) as Inputs;
    if (d.status === "open" && d.head === "tax") {
      const calc = interestFor(d.interestRule, d.principalMinor, inputs, d.asOf ?? asOf);
      if (calc) {
        interestMinor = calc.amountMinor;
        workings.push({
          demandId: d.id,
          caseId: d.caseId,
          caseTitle: caseTitle ?? "Case",
          clientId: d.clientId,
          title: `Interest on ${caseTitle ?? "this demand"}`,
          steps: calc.workings,
          amountMinor: calc.amountMinor,
          verified: calc.verified,
          citation: calc.source.citation,
          warnings: calc.warnings,
        });
      } else if (d.interestMinor) {
        interestMinor = d.interestMinor;
      }
      const penaltyKey = str(inputs.penaltyRule);
      if (penaltyKey) {
        try {
          const range = penaltyRange(penaltyKey, d.principalMinor);
          low = range.lowMinor;
          high = range.highMinor;
        } catch {
          // Unknown rule: leave the range at the stored figures.
        }
      }
      if (!penaltyKey && (d.penaltyMinMinor || d.penaltyMaxMinor)) {
        low = d.penaltyMinMinor ?? 0;
        high = d.penaltyMaxMinor ?? low;
      }
      computed.push({
        ...base,
        interestMinor,
        penaltyLowMinor: low,
        penaltyHighMinor: high,
      });
    }
    views.push({
      id: d.id,
      caseId: d.caseId,
      caseTitle: caseTitle ?? "Case",
      clientId: d.clientId,
      taxType: d.taxType,
      head: d.head,
      status: d.status,
      principalMinor: d.principalMinor,
      interestMinor,
      penaltyLowMinor: low,
      penaltyHighMinor: high,
    });
  }

  return {
    asOf,
    exposure: aggregateExposure(lines, computed),
    demands: views,
    workings,
    clientNames,
  };
}

const TAX_TYPE_LABEL: Record<string, string> = {
  gst: "GST",
  income_tax: "Income tax",
  tds: "TDS",
  roc: "ROC",
  customs: "Customs",
};

export function taxTypeLabel(t: string): string {
  return TAX_TYPE_LABEL[t] ?? t.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
