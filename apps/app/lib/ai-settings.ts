/**
 * Settings → AI (04 §2, §6, §7; 05 §6, §9): read and change an
 * organisation's AI mode, provider, per-tier routing, budget, Opus cap,
 * redaction, per-client exclusion and BYOK key.
 *
 * Callers authorise first (`ai.manage_settings`, house rule 4): see
 * app/actions/ai-settings.ts. Every change is audited. The provider key is
 * encrypted with the org's data key under AI_KEY_MASTER and is never
 * returned, logged or audited; only its last four characters are kept.
 *
 * - The AI plan spends Dueproof's own key (M4): only organisations the
 *   operator lists in AI_PLAN_ORGS may choose it, always with a monthly
 *   budget, at most AI_PLAN_MONTHLY_CAP_MINOR.
 * - A provider address (L3) must be https and public. Only the Local model
 *   mode, on self-hosted and desktop, may name a machine on the local
 *   network (Ollama and the like): choosing that mode is the explicit
 *   setting. Changing the provider or its address forgets the stored key,
 *   so a key can't be sent somewhere new without being entered again.
 */
import "server-only";
import { encryptApiKey } from "@dueproof/ai";
import { AiMode } from "@dueproof/contracts";
import { aiSettings, and, audit, clients, eq, inArray, withOrg } from "@dueproof/db";
import { z } from "zod";
import { loadAiSettings, masterKey, monthlyAiUsage, planEntitled } from "./ai";
import type { AuthContext } from "./authorize";
import { badRequest, forbidden } from "./errors";
import { isPublicHost, type Lookup } from "./net";

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
  /** Hosted: whether the operator lets this organisation use the AI plan. */
  planAvailable: boolean;
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
    planAvailable: planEntitled(env, ctx.orgId),
  };
}

async function checkModeForEdition(
  ctx: AuthContext,
  input: z.output<typeof AiSettingsInput>,
  lookup?: Lookup,
): Promise<void> {
  const { mode, baseUrl, monthlyBudgetMinor } = input;
  const env = ctx.container.env;
  const edition = env.DUEPROOF_EDITION;
  // The plan uses Dueproof's own Claude API key (hosted only in v0.1, D-biz-3).
  if (mode === "plan" && edition !== "hosted")
    throw badRequest("The Dueproof AI plan is available on the hosted edition only.", "ai_mode");
  if (mode === "plan") {
    // M4: an entitlement the operator sets, never the tenant.
    if (!planEntitled(env, ctx.orgId))
      throw forbidden("The Dueproof AI plan isn't turned on for your organisation yet.");
    if (monthlyBudgetMinor === null || monthlyBudgetMinor <= 0)
      throw badRequest("Set a monthly budget for the AI plan.", "ai_budget");
    if (monthlyBudgetMinor > env.AI_PLAN_MONTHLY_CAP_MINOR)
      throw badRequest(
        `The AI plan's budget can be at most $${(env.AI_PLAN_MONTHLY_CAP_MINOR / 100).toFixed(2)} a month.`,
        "ai_budget",
      );
  }
  // A model server on the customer's own network: never from our hosted servers.
  if (mode === "local" && edition === "hosted")
    throw badRequest("Local models are for self-hosted and desktop installs.", "ai_mode");
  if (baseUrl) {
    const url = new URL(baseUrl);
    if (url.username || url.password)
      throw badRequest("Put the key in the key field, not in the address.", "ai_base_url");
    // Local model mode (self-hosted, desktop) is the explicit choice of a
    // machine on your own network: http and private addresses are allowed.
    if (mode === "local") {
      if (url.protocol !== "https:" && url.protocol !== "http:")
        throw badRequest("The provider address must use http or https.", "ai_base_url");
      return;
    }
    if (url.protocol !== "https:")
      throw badRequest("The provider address must use https.", "ai_base_url");
    if (!(await isPublicHost(url.hostname, lookup)))
      throw badRequest(
        "The provider address must be a public internet address. For a model on your own network, choose Local model.",
        "ai_base_url",
      );
  }
}

/** For tests: resolve provider host names without DNS. */
let lookupForTests: Lookup | undefined;
export function setProviderLookupForTests(lookup: Lookup | undefined): void {
  lookupForTests = lookup;
}

export async function saveAiSettingsFor(ctx: AuthContext, raw: unknown): Promise<AiSettingsView> {
  const parsed = AiSettingsInput.safeParse(raw);
  if (!parsed.success) throw badRequest("Check the AI settings and try again.", "invalid_settings");
  const input = parsed.data;
  await checkModeForEdition(ctx, input, lookupForTests);
  const excluded = [...new Set(input.excludedClientIds)];
  const before = await loadAiSettings(ctx.container.database, ctx.orgId);
  // L3: the stored key goes only to the provider and address it was entered for.
  const forgetKey =
    Boolean(before.encryptedKey) &&
    ((before.provider ?? null) !== input.provider || (before.baseUrl ?? null) !== input.baseUrl);

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
    const set = forgetKey ? { ...values, encryptedKey: null, keyLast4: null } : values;
    await tx
      .insert(aiSettings)
      .values({ orgId: ctx.orgId, ...set })
      .onConflictDoUpdate({ target: aiSettings.orgId, set });
    if (forgetKey)
      await audit.write(tx, scope, {
        actor: ctx.userId,
        action: "ai.key_cleared",
        targetType: "org",
        targetId: ctx.orgId,
        requestId: ctx.requestId,
        detail: { reason: "provider_changed" },
      });
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
