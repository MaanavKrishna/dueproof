/**
 * The workflow's ai_assist step (03 §6, 04 §4, §6): between link and
 * reconcile, a model reads the document where the rules aren't confident.
 *
 *   ai_settings (mode off → nothing) → this month's usage from ai_runs →
 *   policyFromSettings → assistExtraction (route, budget, Opus cap, client
 *   exclusion, proof gate: all enforced in packages/ai) → ai_runs rows →
 *   AI findings with the linker's boxes, for reconcileStage
 *
 * The model never produces a date: its findings carry a DateRule that the
 * date engine resolves, and only after reconcile and the proof gate. A
 * failure here never fails the document: the rules' findings stand and the
 * document goes to review. Events and logs carry codes and counts only,
 * never document text or keys.
 */
import "server-only";
import { assistExtraction, type Level } from "@dueproof/ai";
import { aiRuns, uuidv7, withOrg } from "@dueproof/db";
import type { AnalyzeResponse, LinkResponse } from "@dueproof/engine-client";
import { aiAvailableFor, claimAiCall, loadAiPolicy } from "../ai";
import type { Container } from "../server/container";
import {
  gradeRuleFindings,
  loadDateContext,
  loadDocument,
  loadPages,
  type ProvenFinding,
} from "./stages";
import { setStatus } from "./status";
import type { DocumentRef } from "./types";

export interface AiAssistResult {
  /** `off`: AI mode off, no event and no call. */
  status: "off" | "skipped" | "done" | "no_result" | "error";
  /** Why it was skipped (`rules_confident`, `client_excluded`, …) or stopped (`opus_cap`, …). */
  reason?: string;
  level: Level | null;
  /** Feed to reconcileStage. Located ones carry the linker's boxes for evidence. */
  findings: ProvenFinding[];
  /** The model's reading was kept and needs no review of its own. */
  accepted: boolean;
  needsReview: boolean;
  /** Model calls made (each one an `ai_runs` row). */
  calls: number;
  /** The `ai_runs` row whose findings were kept. */
  runId?: string;
  /** An escalation the cap or budget prevented: both readings go to review. */
  blockedEscalation?: string;
}

const OFF: AiAssistResult = {
  status: "off",
  level: null,
  findings: [],
  accepted: false,
  needsReview: false,
  calls: 0,
};

/**
 * Will the AI path take pages the OCR ladder left below the bar? Then the
 * workflow doesn't escalate them to engine-heavy (03 §6a: with AI on, the
 * model's vision OCR is the next rung). Off, no provider, or the client is
 * excluded from AI: escalate as before.
 */
export async function aiReadsPagesStage(c: Container, ref: DocumentRef): Promise<boolean> {
  const { policy } = await loadAiPolicy(c, ref.orgId);
  if (policy.mode === "off") return false;
  const doc = await loadDocument(c, ref);
  return aiAvailableFor(policy, doc.clientId);
}

const matchKey = (id: string, quote: string) => `${id}\u0000${quote}`;

export async function aiAssistStage(
  c: Container,
  ref: DocumentRef,
  analysis: AnalyzeResponse,
  link: LinkResponse,
  lowConfidencePages: number[] = [],
): Promise<AiAssistResult> {
  const { policy } = await loadAiPolicy(c, ref.orgId);
  if (policy.mode === "off") return OFF;
  // The ai.org rate limit (L5): over it, no model call; the document goes to review.
  if (!(await claimAiCall(c, ref.orgId)))
    return { ...OFF, status: "skipped", reason: "rate_limited", needsReview: true };

  await setStatus(c.database, ref.orgId, ref.documentId, "ai_assist", "started");
  const doc = await loadDocument(c, ref);
  const pages = await loadPages(c, ref);
  const ruleFindings = gradeRuleFindings(analysis, link);
  const dateContext = await loadDateContext(c, ref, analysis.issuedOn);

  // Every answer the linker gave, keyed by the quote asked about: AI finding
  // ids repeat across retries on one level, quotes tell the attempts apart.
  const matches = new Map<string, LinkResponse["matches"][number]>();
  const linkForAi = async (quotes: { id: string; text: string; pageHint?: number }[]) => {
    const res = await c.engine.link({ pages, quotes });
    const textById = new Map(quotes.map((q) => [q.id, q.text]));
    for (const m of res.matches) matches.set(matchKey(m.id, textById.get(m.id) ?? ""), m);
    return res;
  };

  // TODO(04 §3 vision OCR fallback): pages the OCR ladder left below the bar
  // should go to the provider's vision model here, aligned to the OCR word
  // boxes where possible. packages/ai has no vision call yet, so those pages
  // stay in needsEscalation and the document goes to review.
  const visionPending = lowConfidencePages.length;

  let result: Awaited<ReturnType<typeof assistExtraction>>;
  try {
    result = await assistExtraction(
      {
        documentId: ref.documentId,
        clientId: doc.clientId,
        pages,
        analyze: analysis,
        ruleFindings,
        docRole: doc.role,
        link: linkForAi,
        dateContext,
      },
      policy,
      c.aiProvider ? { provider: c.aiProvider } : {},
    );
  } catch (e) {
    // Key, configuration or engine trouble. Name only: messages can carry input.
    console.error("ai_assist failed", e instanceof Error ? e.name : typeof e);
    await setStatus(c.database, ref.orgId, ref.documentId, "ai_assist", "error");
    return { ...OFF, status: "error", reason: "error", needsReview: true };
  }

  // One ai_runs row per call. No document text: counts, ids and outcomes only.
  const createdAt = new Date();
  const rows = result.runs.map((r) => ({
    id: uuidv7(),
    orgId: ref.orgId,
    documentId: ref.documentId,
    feature: r.feature,
    tier: r.tier,
    provider: r.provider,
    model: r.model,
    promptVersion: r.promptVersion,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    cacheReadTokens: r.cacheReadTokens,
    costMicroUsd: r.costMicroUsd,
    latencyMs: r.latencyMs,
    outcome: r.outcome,
    escalationReason: r.escalationReason,
    createdAt,
  }));
  if (rows.length) await withOrg(c.database, ref.orgId, (tx) => tx.insert(aiRuns).values(rows));

  // The kept reading came from the newest usable call on its level.
  let runId: string | undefined;
  if (result.level) {
    for (let i = result.runs.length - 1; i >= 0; i--) {
      const r = result.runs[i];
      if (r?.outcome === "ok" && (r.tier === result.level || r.tier === "local")) {
        runId = rows[i]?.id;
        break;
      }
    }
  }

  // Located only with a page and at least one box, as for rule findings (house rule 3).
  const findings: ProvenFinding[] = result.aiFindings.map((g) => {
    const m = matches.get(matchKey(g.id, g.finding.quote));
    if (g.grade !== "unlocated" && m && m.page !== undefined && m.rects.length > 0)
      return { ...g, page: m.page, rects: m.rects, score: m.score };
    return { id: g.id, finding: g.finding, grade: "unlocated", rects: [], score: m?.score ?? 0 };
  });

  const reason = result.skipped ?? result.stoppedBy;
  const status: AiAssistResult["status"] = result.status;
  const parts = [
    status === "skipped"
      ? `skipped: ${reason}`
      : `${result.level ?? "none"}: ${findings.length} findings`,
    `${rows.length} calls`,
    ...(result.stoppedBy ? [`stopped: ${result.stoppedBy}`] : []),
    ...(visionPending ? [`${visionPending} pages await vision OCR`] : []),
  ];
  await setStatus(c.database, ref.orgId, ref.documentId, "ai_assist", parts.join("; "));

  return {
    status,
    ...(reason ? { reason } : {}),
    level: result.level,
    findings,
    accepted: status === "done" && !result.needsReview,
    needsReview: status !== "skipped" && result.needsReview,
    calls: rows.length,
    ...(runId ? { runId } : {}),
    ...(result.blockedEscalation ? { blockedEscalation: result.blockedEscalation } : {}),
  };
}
