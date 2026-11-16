import "server-only";
import type { DocumentStatus } from "@dueproof/contracts";
import {
  and,
  type Database,
  documentEvents,
  documents,
  eq,
  type OrgTx,
  withOrg,
} from "@dueproof/db";
import { publishDocumentStatus } from "../events";

/** Record a status change inside an org-scoped transaction. Call `announce` after commit. */
export async function writeStatus(
  tx: OrgTx,
  orgId: string,
  documentId: string,
  status: DocumentStatus,
  detail: string | null = null,
): Promise<void> {
  await tx
    .update(documents)
    .set({ status, statusDetail: detail })
    .where(and(eq(documents.orgId, orgId), eq(documents.id, documentId)));
  await tx.insert(documentEvents).values({ orgId, documentId, stage: status, detail });
}

export function announce(
  orgId: string,
  documentId: string,
  status: DocumentStatus,
  detail: string | null = null,
) {
  publishDocumentStatus({ orgId, documentId, status, detail, at: new Date().toISOString() });
}

/** Write and announce a status change in its own transaction. */
export async function setStatus(
  database: Database,
  orgId: string,
  documentId: string,
  status: DocumentStatus,
  detail: string | null = null,
): Promise<void> {
  await withOrg(database, orgId, (tx) => writeStatus(tx, orgId, documentId, status, detail));
  announce(orgId, documentId, status, detail);
}

/** Today's date in a timezone, as an ISO date. */
export function todayIn(timezone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts; // en-CA formats as YYYY-MM-DD
}
