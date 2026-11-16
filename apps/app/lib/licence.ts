/**
 * The Business licence on this install (08 §5): where it's kept, what state
 * it's in, and installing or removing it. Verification itself is in ee/ and
 * entirely offline; without ee/ every install is Self-hosted Free.
 *
 * The `licence` table holds one row for the whole install (it has no org_id,
 * so it's read outside withOrg, like the auth tables in server/directory.ts).
 * Callers authorise first; installing and removing write audit entries
 * naming the licence id, never the file.
 */
import "server-only";
import { type Database, desc, eq, schema } from "@dueproof/db";
import { unsafeRawDb } from "@dueproof/db/internal";
import {
  type BusinessFeature,
  featureActive,
  LicenceFileError,
  type LicenceStatus,
  type LicenceStore,
  NO_LICENCE,
} from "@dueproof/plugins";
import type { AuthContext } from "./authorize";
import { loadEe } from "./ee";
import { badRequest } from "./errors";
import { writeAudit } from "./settings";

const ROW_ID = "current";

export function licenceStore(database: Database): LicenceStore {
  const raw = unsafeRawDb(database);
  const t = schema.licence;
  return {
    async read() {
      const [row] = await raw.select().from(t).where(eq(t.id, ROW_ID)).limit(1);
      return row ? { payload: row.payload, signature: row.signature } : null;
    },
    async write(l) {
      await raw
        .insert(t)
        .values({ id: ROW_ID, payload: l.payload, signature: l.signature })
        .onConflictDoUpdate({
          target: t.id,
          set: { payload: l.payload, signature: l.signature, installedAt: new Date() },
        });
    },
    async remove() {
      await raw.delete(t).where(eq(t.id, ROW_ID));
    },
    async latestSeenAt() {
      // The newest audit entry on the install (all organisations): the latest
      // time this server is known to have been running.
      const [row] = await raw
        .select({ at: schema.audit.at })
        .from(schema.audit)
        .orderBy(desc(schema.audit.id))
        .limit(1);
      return row?.at ?? null;
    },
  };
}

/** The licence state now. NO_LICENCE without ee/; never throws. */
export async function licenceStatus(database: Database, now = new Date()): Promise<LicenceStatus> {
  const ee = loadEe();
  if (!ee) return NO_LICENCE;
  try {
    const store = licenceStore(database);
    const [stored, latestSeenAt] = await Promise.all([store.read(), store.latestSeenAt()]);
    return ee.licence.evaluate(stored, { now, latestSeenAt });
  } catch (e) {
    console.error("licence check failed", e instanceof Error ? e.name : typeof e);
    return NO_LICENCE;
  }
}

export async function hasFeature(database: Database, feature: BusinessFeature): Promise<boolean> {
  return featureActive(await licenceStatus(database), feature);
}

/** For Settings → System. */
export interface LicenceView {
  /** False when this build has no ee/ (Self-hosted Free). */
  available: boolean;
  status: LicenceStatus;
  members: number;
}

export async function installLicenceFor(ctx: AuthContext, text: string): Promise<LicenceStatus> {
  const ee = loadEe();
  if (!ee) throw badRequest("This build has no Business features. Use the Business image.");
  let stored: ReturnType<typeof ee.licence.parseFile>;
  try {
    stored = ee.licence.parseFile(text);
  } catch (e) {
    if (e instanceof LicenceFileError) throw badRequest(e.message);
    throw e;
  }
  const store = licenceStore(ctx.container.database);
  const status = ee.licence.evaluate(stored, {
    now: new Date(),
    latestSeenAt: await store.latestSeenAt(),
  });
  if (status.state === "invalid") throw badRequest(status.problem ?? "That licence isn't valid.");
  if (status.state === "expired")
    throw badRequest(status.problem ?? "That licence has expired. Ask for a renewed file.");
  await store.write(stored);
  await writeAudit(ctx, "licence.install", {
    licenceId: status.licence?.licenceId,
    features: status.active,
    expiresAt: status.licence?.expiresAt,
  });
  return status;
}

export async function removeLicenceFor(ctx: AuthContext): Promise<LicenceStatus> {
  const store = licenceStore(ctx.container.database);
  const before = await licenceStatus(ctx.container.database);
  await store.remove();
  await writeAudit(ctx, "licence.remove", { licenceId: before.licence?.licenceId ?? null });
  return NO_LICENCE;
}

/**
 * Reports hide the Dueproof mark when the licence includes white-label
 * reports. REPORT_WHITE_LABEL=1 does the same without a licence, for
 * development only.
 */
export async function whiteLabelReports(container: {
  database: Database;
  env: { REPORT_WHITE_LABEL: boolean };
}): Promise<boolean> {
  if (container.env.REPORT_WHITE_LABEL) return true;
  const whiteLabel = loadEe()?.whiteLabel;
  if (!whiteLabel) return false;
  return whiteLabel.enabled(await licenceStatus(container.database));
}
