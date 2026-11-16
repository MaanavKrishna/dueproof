/**
 * Settings → System (01 §3, 03 §12, §14): health, backups, the audit trail
 * with its hash-chain check, version, and every host this install talks to.
 * Callers authorise first (`audit.view`, owners and admins).
 */
import "server-only";
import { readFile } from "node:fs/promises";
import { aiSettings, audit, desc, eq, schema, withOrg } from "@dueproof/db";
import type { AuthContext } from "./authorize";
import type { Env } from "./env";
import { storageOrigins } from "./security/headers";
import { type Health, health } from "./server/diagnostics";
import { listMembers } from "./server/directory";

export interface BackupStatus {
  /** "unknown" when this install can't see the backup folder. */
  state: "ok" | "failed" | "unknown" | "managed";
  name?: string;
  at?: string;
  message?: string;
  /** The last good backup is older than 48 hours (03 §14). */
  stale?: boolean;
}

export async function backupStatus(env: Env, now = new Date()): Promise<BackupStatus> {
  if (env.DUEPROOF_EDITION === "hosted") return { state: "managed" };
  if (!env.BACKUP_STATUS_FILE) return { state: "unknown" };
  try {
    const raw = JSON.parse(await readFile(env.BACKUP_STATUS_FILE, "utf8")) as Record<
      string,
      unknown
    >;
    const at = typeof raw.at === "string" ? raw.at : undefined;
    const state = raw.status === "ok" ? "ok" : "failed";
    const stale = at ? now.getTime() - Date.parse(at) > 48 * 60 * 60 * 1000 : true;
    return {
      state,
      ...(typeof raw.name === "string" ? { name: raw.name } : {}),
      ...(at ? { at } : {}),
      ...(typeof raw.message === "string" && raw.message ? { message: raw.message } : {}),
      stale,
    };
  } catch {
    return { state: "unknown" };
  }
}

export interface OutboundHost {
  host: string;
  purpose: string;
}

const PROVIDER_HOSTS: Record<string, string> = {
  anthropic: "api.anthropic.com",
  openai: "api.openai.com",
  google: "generativelanguage.googleapis.com",
  openrouter: "openrouter.ai",
};

function hostOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * Every host this install connects to, from its configuration. Nothing else
 * is contacted: no telemetry, no update checks (08).
 */
export function outboundHosts(
  env: Env,
  ai: { mode: string; provider: string | null; baseUrl: string | null } | null,
): OutboundHost[] {
  const out: OutboundHost[] = [];
  if (env.DATABASE_DRIVER !== "pglite") {
    const h = hostOf(env.DATABASE_URL);
    if (h) out.push({ host: h.replace(/^.*@/, ""), purpose: "Database" });
  }
  if (env.ENGINE_MODE === "http") {
    const h = hostOf(env.ENGINE_URL);
    if (h) out.push({ host: h, purpose: "Reading engine (OCR, translation, rules)" });
  }
  for (const origin of storageOrigins(env)) {
    out.push({ host: origin.replace(/^https?:\/\//, ""), purpose: "File storage" });
  }
  if (env.DUEPROOF_EDITION === "hosted" && env.HEAVY_ENGINE_SNAPSHOT_ID) {
    out.push({ host: "vercel.com (Sandbox)", purpose: "Heavy reading for hard pages" });
  }
  if (ai && ai.mode !== "off") {
    const h =
      hostOf(ai.baseUrl) ??
      (ai.provider ? PROVIDER_HOSTS[ai.provider] : undefined) ??
      (ai.mode === "plan" ? "api.anthropic.com" : null);
    if (h) out.push({ host: h, purpose: ai.mode === "local" ? "Local AI model" : "AI provider" });
  }
  return out;
}

export interface AuditRow {
  id: number;
  at: string;
  actor: string | null;
  actorName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: unknown;
}

export interface SystemView {
  health: Health;
  backups: BackupStatus;
  edition: Env["DUEPROOF_EDITION"];
  version: string;
  outbound: OutboundHost[];
  audit: {
    rows: AuditRow[];
    total: number;
    verify: { ok: boolean; count: number; brokenAt?: number };
  };
}

export const AUDIT_PAGE = 50;

export async function listAudit(ctx: AuthContext, page = 0): Promise<AuditRow[]> {
  const { database } = ctx.container;
  const [rows, members] = await Promise.all([
    withOrg(database, ctx.orgId, (tx) =>
      tx
        .select()
        .from(schema.audit)
        .where(eq(schema.audit.orgId, ctx.orgId))
        .orderBy(desc(schema.audit.id))
        .limit(AUDIT_PAGE)
        .offset(Math.max(0, page) * AUDIT_PAGE),
    ),
    listMembers(database, ctx.orgId),
  ]);
  const names = new Map(members.map((m) => [m.userId, m.name]));
  return rows.map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    actor: r.actor,
    actorName: r.actor ? (names.get(r.actor) ?? null) : null,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    detail: r.detail,
  }));
}

export async function verifyAudit(ctx: AuthContext) {
  return withOrg(ctx.container.database, ctx.orgId, (tx, orgCtx) => audit.verify(tx, orgCtx));
}

export async function getSystemFor(ctx: AuthContext): Promise<SystemView> {
  const { container } = ctx;
  const [h, backups, rows, verify, ai] = await Promise.all([
    health(container),
    backupStatus(container.env),
    listAudit(ctx, 0),
    verifyAudit(ctx),
    withOrg(container.database, ctx.orgId, async (tx) => {
      const [row] = await tx
        .select({
          mode: aiSettings.mode,
          provider: aiSettings.provider,
          baseUrl: aiSettings.baseUrl,
        })
        .from(aiSettings)
        .where(eq(aiSettings.orgId, ctx.orgId))
        .limit(1);
      return row ?? null;
    }),
  ]);
  return {
    health: h,
    backups,
    edition: container.env.DUEPROOF_EDITION,
    version: container.env.DUEPROOF_VERSION,
    outbound: outboundHosts(container.env, ai),
    audit: { rows, total: verify.count, verify },
  };
}
