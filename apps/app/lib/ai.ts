/**
 * An organisation's AI settings and this month's usage, turned into the
 * `AiPolicy` packages/ai enforces (04 §5, §6, §7). Used by the workflow's
 * ai_assist step and by Settings → AI.
 *
 * Keys stay encrypted here: `policyFromSettings` hands the provider a
 * function that decrypts the BYOK key on first use, inside the call path.
 * Nothing here logs a key or document text.
 */
import "server-only";
import {
  type AiPolicy,
  type AiSettingsRow,
  type AiUsage,
  isClientExcluded,
  loadMasterKey,
  policyFromSettings,
} from "@dueproof/ai";
import { aiRuns, aiSettings, and, type Database, eq, gte, sql, withOrg } from "@dueproof/db";
import type { Env } from "./env";

export type StoredAiSettings = AiSettingsRow & { keyLast4: string | null };

/** The org's `ai_settings` row, or the default (AI off) when it has none. */
export async function loadAiSettings(database: Database, orgId: string): Promise<StoredAiSettings> {
  const [row] = await withOrg(database, orgId, (tx) =>
    tx.select().from(aiSettings).where(eq(aiSettings.orgId, orgId)).limit(1),
  );
  return (
    row ?? {
      orgId,
      mode: "off",
      provider: null,
      baseUrl: null,
      encryptedKey: null,
      keyLast4: null,
      routing: null,
      monthlyBudgetMinor: null,
      opusCapPercent: 5,
      redactPii: false,
      excludedClientIds: [],
    }
  );
}

/** First instant of the calendar month (UTC) that `now` falls in. */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Calls, Opus calls and spend this calendar month, from `ai_runs`. The month
 * is the UTC calendar month, matching how provider invoices are cut.
 */
export async function monthlyAiUsage(
  database: Database,
  orgId: string,
  now: Date = new Date(),
): Promise<AiUsage> {
  const [row] = await withOrg(database, orgId, (tx) =>
    tx
      .select({
        calls: sql<number>`count(*)`,
        opus: sql<number>`count(*) filter (where ${aiRuns.tier} = 'opus')`,
        spent: sql<string>`coalesce(sum(${aiRuns.costMicroUsd}), 0)`,
      })
      .from(aiRuns)
      .where(and(eq(aiRuns.orgId, orgId), gte(aiRuns.createdAt, monthStart(now)))),
  );
  return {
    aiCallsThisMonth: Number(row?.calls ?? 0),
    opusCallsThisMonth: Number(row?.opus ?? 0),
    spentMicroUsdThisMonth: Number(row?.spent ?? 0),
  };
}

/** The master key, when this install has one. Throws (without the value) if it is malformed. */
export function masterKey(env: Pick<Env, "AI_KEY_MASTER">): Buffer | undefined {
  return env.AI_KEY_MASTER ? loadMasterKey({ AI_KEY_MASTER: env.AI_KEY_MASTER }) : undefined;
}

export interface LoadedPolicy {
  policy: AiPolicy;
  settings: StoredAiSettings;
}

/** Settings + usage → policy. The plan's gateway key is used on the hosted edition only. */
export async function loadAiPolicy(
  c: { env: Env; database: Database },
  orgId: string,
  now: Date = new Date(),
): Promise<LoadedPolicy> {
  const settings = await loadAiSettings(c.database, orgId);
  const usage =
    settings.mode === "off"
      ? { aiCallsThisMonth: 0, opusCallsThisMonth: 0, spentMicroUsdThisMonth: 0 }
      : await monthlyAiUsage(c.database, orgId, now);
  const master = masterKey(c.env);
  const gatewayKey = c.env.DUEPROOF_EDITION === "hosted" ? c.env.AI_GATEWAY_API_KEY : undefined;
  const policy = policyFromSettings(settings, {
    usage,
    ...(master ? { master } : {}),
    ...(gatewayKey ? { gatewayKey } : {}),
  });
  return { policy, settings };
}

/**
 * Would a model see this document? Mode on, a provider configured (a key
 * stored for BYOK, the gateway key for the plan), and the client not excluded.
 */
export function aiAvailableFor(policy: AiPolicy, clientId: string | null | undefined): boolean {
  return policy.mode !== "off" && policy.provider !== null && !isClientExcluded(policy, clientId);
}
