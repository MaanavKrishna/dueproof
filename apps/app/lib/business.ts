/**
 * Business features as the app uses them (08 §1): SAML single sign-on set-up
 * and audit export. Each needs ee/ and a licence that lists the feature; the
 * free build answers "not available" and nothing else changes.
 *
 * Callers authorise first (house rule 4): SSO with `team.manage`, audit
 * export with `audit.view` (owners and admins). Every change and every
 * export writes an audit entry.
 */
import "server-only";
import { and, asc, type Database, eq, lte, schema, withOrg } from "@dueproof/db";
import {
  type AuditExportFormat,
  type AuditExportResult,
  featureActive,
  type LicenceStatus,
  SsoConfigError,
  type SsoProviderView,
} from "@dueproof/plugins";
import type { AuthContext } from "./authorize";
import { loadEe } from "./ee";
import { badRequest, forbidden } from "./errors";
import { licenceStatus } from "./licence";
import { writeAudit } from "./settings";

// ------------------------------------------------------------------ SSO

export interface SsoSettingsView {
  /** ee/ is present (the Business build). */
  available: boolean;
  /** The licence includes SSO and is in effect. */
  licensed: boolean;
  providers: SsoProviderView[];
  /** What to give the IdP (ACS URL, entity ID), before or after saving. */
  serviceProvider: { acsUrl: string; spEntityId: string } | null;
}

export async function ssoSettingsFor(ctx: AuthContext): Promise<SsoSettingsView> {
  const sso = loadEe()?.sso;
  if (!sso) return { available: false, licensed: false, providers: [], serviceProvider: null };
  const { database, env } = ctx.container;
  const licensed = featureActive(await licenceStatus(database), "sso");
  const providers = licensed ? await sso.list(database, ctx.orgId, env.APP_URL) : [];
  const { acsUrl, spEntityId } = sso.serviceProvider(env.APP_URL, ctx.orgId);
  return { available: true, licensed, providers, serviceProvider: { acsUrl, spEntityId } };
}

async function requireSso(ctx: AuthContext) {
  const sso = loadEe()?.sso;
  if (!sso || !featureActive(await licenceStatus(ctx.container.database), "sso"))
    throw forbidden("Single sign-on needs a Dueproof Business licence.");
  return sso;
}

function apiMessage(e: unknown): string | null {
  if (e instanceof SsoConfigError) return e.message;
  // Better Auth's APIError carries a safe, user-facing message in body.
  const body = (e as { body?: { message?: unknown } } | null)?.body;
  return typeof body?.message === "string" ? body.message : null;
}

export async function saveSsoFor(
  ctx: AuthContext,
  input: unknown,
  headers: Headers,
): Promise<SsoProviderView> {
  const sso = await requireSso(ctx);
  const { auth, database, env } = ctx.container;
  try {
    const config = await sso.parseConfig(input);
    const saved = await sso.save(auth, database, headers, ctx.orgId, config, env.APP_URL);
    await writeAudit(
      ctx,
      "sso.configure",
      { providerId: saved.providerId, domains: saved.domains, defaultRole: saved.defaultRole },
      { type: "sso_provider", id: saved.providerId },
    );
    return saved;
  } catch (e) {
    const message = apiMessage(e);
    if (message) throw badRequest(message);
    throw e;
  }
}

export async function removeSsoFor(ctx: AuthContext, providerId: string): Promise<void> {
  // Removing is allowed after the licence lapses too: it only takes access away.
  const sso = loadEe()?.sso;
  if (!sso) throw forbidden("Single sign-on isn't part of this build.");
  if (typeof providerId !== "string" || providerId.length > 200) throw badRequest("Bad provider.");
  const removed = await sso.remove(ctx.container.database, ctx.orgId, providerId);
  if (!removed) throw badRequest("That identity provider isn't set up here.");
  await writeAudit(ctx, "sso.remove", { providerId }, { type: "sso_provider", id: providerId });
}

/** The sign-in page shows "Continue with SSO" only when this is true. */
export async function ssoSignInAvailable(database: Database): Promise<boolean> {
  const sso = loadEe()?.sso;
  if (!sso) return false;
  try {
    return featureActive(await licenceStatus(database), "sso") && (await sso.configured(database));
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ audit export

export interface AuditExportRequest {
  from: string | null;
  to: string | null;
  format: AuditExportFormat;
  /** The records file, or its verification report. */
  part: "records" | "report";
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function parseAuditExportQuery(params: URLSearchParams): AuditExportRequest {
  const from = params.get("from") || null;
  const to = params.get("to") || null;
  for (const d of [from, to])
    if (d !== null && (!ISO_DAY.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))))
      throw badRequest("Use dates like 2026-04-01.");
  if (from && to && from > to) throw badRequest("The start date is after the end date.");
  const format = params.get("format") ?? "jsonl";
  if (format !== "jsonl" && format !== "csv") throw badRequest("Choose JSONL or CSV.");
  const part = params.get("part") ?? "records";
  if (part !== "records" && part !== "report") throw badRequest("Bad export part.");
  return { from, to, format, part };
}

export function auditExportAvailable(status: LicenceStatus): boolean {
  return Boolean(loadEe()?.auditExport) && featureActive(status, "audit-export");
}

export async function exportAuditFor(
  ctx: AuthContext,
  req: AuditExportRequest,
  now = new Date(),
): Promise<AuditExportResult> {
  const exporter = loadEe()?.auditExport;
  if (!exporter || !featureActive(await licenceStatus(ctx.container.database), "audit-export"))
    throw forbidden("Audit export needs a Dueproof Business licence.");
  const from = req.from ? new Date(`${req.from}T00:00:00.000Z`) : null;
  const to = req.to ? new Date(`${req.to}T23:59:59.999Z`) : null;
  const t = schema.audit;
  // Every entry from the organisation's first to the end of the range, so the
  // chain is checked from its start.
  const chain = await withOrg(ctx.container.database, ctx.orgId, (tx) =>
    tx
      .select()
      .from(t)
      .where(to ? and(eq(t.orgId, ctx.orgId), lte(t.at, to)) : eq(t.orgId, ctx.orgId))
      .orderBy(asc(t.id)),
  );
  const result = exporter.build({
    orgId: ctx.orgId,
    chain,
    from,
    to,
    format: req.format,
    now,
  });
  await writeAudit(ctx, "audit.export", {
    from: req.from,
    to: req.to,
    format: req.format,
    part: req.part,
    count: result.report.count,
    chainOk: result.report.chain.ok,
  });
  return result;
}
