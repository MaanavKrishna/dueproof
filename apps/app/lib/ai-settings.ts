/**
 * Settings → AI (04 §2, §6, §7; 05 §6, §9): read and change an
 * organisation's AI mode, provider, per-tier routing, budget, Opus cap,
 * redaction, per-client exclusion and BYOK key.
 *
 * Callers authorise first (`ai.manage_settings`, AGENTS rule 4): see
 * app/actions/ai-settings.ts. Every change is audited. The provider key is
 * encrypted with the org's data key under AI_KEY_MASTER and is never
 * returned, logged or audited; only its last four characters are kept.
 */
import "server-only";
import { encryptApiKey } from "@dueproof/ai";
import { AiMode } from "@dueproof/contracts";
import { aiSettings, and, audit, clients, eq, inArray, withOrg } from "@dueproof/db";
import { z } from "zod";
import { loadAiSettings, masterKey, monthlyAiUsage } from "./ai";
import type { AuthContext } from "./authorize";
import { badRequest } from "./errors";

export interface AiSettingsView {
  mode: AiMode;
  provider: string | null;
  baseUrl: string | null;
  routing: { haiku?: string; sonnet?: string; opus?: string };
  /** USD cents a month; null = no cap. */
  monthlyBudgetMinor: number | null;
  opusCapPercent: number;
  redactPii: boolean;
  excludedClientIds: string[];
  /** Last four characters of the stored key, or null when there is none. */
  keyLast4: string | null;
  /** Whether this install can store a key at all (AI_KEY_MASTER is set). */
  canStoreKey: boolean;
  /** This calendar month (UTC). */
  usage: { calls: number; opusCalls: number; costMicroUsd: number };
}

const ModelId = z.string().trim().min(1).max(120);

export const AiSettingsInput = z
  .object({
    mode: AiMode,
    /** anthropic, openai, azure-openai, ollama, vllm, lmstudio, openrouter, … */
    provider: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "Choose a provider.")
      .nullable()
      .default(null),
    baseUrl: z.string().trim().url().max(500).nullable().default(null),
    routing: z
      .object({ haiku: ModelId.optional(), sonnet: ModelId.optional(), opus: ModelId.optional() })
      .strict()
      .default({}),
    monthlyBudgetMinor: z.number().int().min(0).max(100_000_000).nullable().default(null),
    opusCapPercent: z.number().int().min(0).max(100).default(5),
    redactPii: z.boolean().default(false),
    excludedClientIds: z.array(z.string().min(1).max(64)).max(10_000).default([]),
  })
  .strict();
export type AiSettingsInput = z.input<typeof AiSettingsInput>;

export async function getAiSettingsView(ctx: AuthContext): Promise<AiSettingsView> {
  const { database, env } = ctx.container;
  const s = await loadAiSettings(database, ctx.orgId);
  const usage = await monthlyAiUsage(database, ctx.orgId);
  const routing = (s.routing ?? {}) as AiSettingsView["routing"];
  return {
    mode: s.mode,
    provider: s.provider,
    baseUrl: s.baseUrl,
    routing: {
      ...(routing.haiku ? { haiku: routing.haiku } : {}),
      ...(routing.sonnet ? { sonnet: routing.sonnet } : {}),
      ...(routing.opus ? { opus: routing.opus } : {}),
    },
    monthlyBudgetMinor: s.monthlyBudgetMinor,
    opusCapPercent: s.opusCapPercent,
    redactPii: s.redactPii,
    excludedClientIds: s.excludedClientIds,
    keyLast4: s.encryptedKey ? s.keyLast4 : null,
    canStoreKey: Boolean(env.AI_KEY_MASTER),
    usage: {
      calls: usage.aiCallsThisMonth,
      opusCalls: usage.opusCallsThisMonth,
      costMicroUsd: usage.spentMicroUsdThisMonth,
    },
  };
}

function checkModeForEdition(
  mode: AiMode,
  baseUrl: string | null,
  edition: AuthContext["container"]["env"]["DUEPROOF_EDITION"],
) {
  // The plan uses Dueproof's own Claude API key (hosted only in v0.1, D-biz-3).
  if (mode === "plan" && edition !== "hosted")
    throw badRequest("The Dueproof AI plan is available on the hosted edition only.", "ai_mode");
  // A model server on the customer's own network: never from our hosted servers.
  if (mode === "local" && edition === "hosted")
    throw badRequest("Local models are for self-hosted and desktop installs.", "ai_mode");
  if (baseUrl) {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" && !(mode === "local" && url.protocol === "http:"))
      throw badRequest("The provider address must use https.", "ai_base_url");
    if (url.username || url.password)
      throw badRequest("Put the key in the key field, not in the address.", "ai_base_url");
  }
}

export async function saveAiSettingsFor(ctx: AuthContext, raw: unknown): Promise<AiSettingsView> {
  const parsed = AiSettingsInput.safeParse(raw);
  if (!parsed.success) throw badRequest("Check the AI settings and try again.", "invalid_settings");
  const input = parsed.data;
  checkModeForEdition(input.mode, input.baseUrl, ctx.container.env.DUEPROOF_EDITION);
  const excluded = [...new Set(input.excludedClientIds)];

  await withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
    if (excluded.length) {
      const found = await tx
        .select({ id: clients.id })
        .from(clients)
        .where(and(eq(clients.orgId, ctx.orgId), inArray(clients.id, excluded)));
      if (found.length !== excluded.length)
        throw badRequest("One of the excluded clients wasn't found.", "unknown_client");
    }
    const values = {
      mode: input.mode,
      provider: input.provider,
      baseUrl: input.baseUrl,
      routing: input.routing,
      monthlyBudgetMinor: input.monthlyBudgetMinor,
      opusCapPercent: input.opusCapPercent,
      redactPii: input.redactPii,
      excludedClientIds: excluded,
    };
    await tx
      .insert(aiSettings)
      .values({ orgId: ctx.orgId, ...values })
      .onConflictDoUpdate({ target: aiSettings.orgId, set: values });
    await audit.write(tx, scope, {
      actor: ctx.userId,
      action: "ai.settings_changed",
      targetType: "org",
      targetId: ctx.orgId,
      requestId: ctx.requestId,
      // Settings only; the key has its own actions and is never in the trail.
      detail: { ...values, excludedClientIds: excluded.length },
    });
  });
  return getAiSettingsView(ctx);
}

export async function setAiKeyFor(
  ctx: AuthContext,
  plainKey: unknown,
): Promise<{ keyLast4: string }> {
  if (typeof plainKey !== "string") throw badRequest("Paste the provider key.", "invalid_key");
  const key = plainKey.trim();
  if (key.length < 8 || key.length > 4096 || /\s/.test(key))
    throw badRequest("That doesn't look like a provider key.", "invalid_key");
  const master = masterKey(ctx.container.env);
  if (!master)
    throw badRequest(
      "This install can't store keys yet: ask your administrator to set AI_KEY_MASTER.",
      "no_master_key",
    );
  const sealed = encryptApiKey(key, ctx.orgId, master);
  await withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
    const set = { encryptedKey: sealed.ciphertext, keyLast4: sealed.last4 };
    await tx
      .insert(aiSettings)
      .values({ orgId: ctx.orgId, ...set })
      .onConflictDoUpdate({ target: aiSettings.orgId, set });
    await audit.write(tx, scope, {
      actor: ctx.userId,
      action: "ai.key_set",
      targetType: "org",
      targetId: ctx.orgId,
      requestId: ctx.requestId,
      detail: null,
    });
  });
  return { keyLast4: sealed.last4 };
}

export async function clearAiKeyFor(ctx: AuthContext): Promise<{ cleared: boolean }> {
  const cleared = await withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
    const rows = await tx
      .update(aiSettings)
      .set({ encryptedKey: null, keyLast4: null })
      .where(eq(aiSettings.orgId, ctx.orgId))
      .returning({ orgId: aiSettings.orgId });
    await audit.write(tx, scope, {
      actor: ctx.userId,
      action: "ai.key_cleared",
      targetType: "org",
      targetId: ctx.orgId,
      requestId: ctx.requestId,
      detail: null,
    });
    return rows.length > 0;
  });
  return { cleared };
}
