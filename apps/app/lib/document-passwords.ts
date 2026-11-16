/**
 * Passwords for protected PDFs (01 §4 "When things go wrong", 05 §4).
 *
 * Entered once, for one processing run. The pipeline's steps can run on any
 * instance, so the password waits in `document_passwords`, never in plain
 * text: AES-256-GCM under a key derived from AUTH_SECRET, with the org and
 * document bound in as AAD (a row copied to another org or document doesn't
 * open). It expires after 15 minutes and is deleted when the run finishes
 * or fails. Never log it, and never put it in a step's result.
 */
import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { and, type Database, documentPasswords, eq, lt, type OrgTx, withOrg } from "@dueproof/db";
import type { DocumentRef } from "./pipeline/types";

export const PASSWORD_TTL_MS = 15 * 60_000;
const VERSION = "v1";
const IV_BYTES = 12;

function keyFor(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "dueproof", "dueproof:document-password:v1", 32));
}

const aadFor = (orgId: string, documentId: string) =>
  Buffer.from(`document-password:${orgId}:${documentId}`, "utf8");

/** Encrypt a password for one document of one org. */
export function sealDocumentPassword(
  secret: string,
  orgId: string,
  documentId: string,
  password: string,
): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyFor(secret), iv);
  cipher.setAAD(aadFor(orgId, documentId));
  const ct = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ct]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

/** Decrypt, or undefined when the envelope is malformed, tampered or for another org/document. */
export function openDocumentPassword(
  secret: string,
  orgId: string,
  documentId: string,
  sealed: string,
): string | undefined {
  const [version, ...rest] = sealed.split(".");
  if (version !== VERSION || rest.length !== 3) return undefined;
  const [iv, tag, ct] = rest.map((p) => Buffer.from(p, "base64url")) as [Buffer, Buffer, Buffer];
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyFor(secret), iv);
    decipher.setAAD(aadFor(orgId, documentId));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    return undefined;
  }
}

interface Deps {
  database: Database;
  env: { AUTH_SECRET: string };
}

/** Store the password for the next run, inside the caller's org transaction. */
export async function storeDocumentPassword(
  tx: OrgTx,
  secret: string,
  ref: DocumentRef,
  password: string,
  now = new Date(),
): Promise<void> {
  const values = {
    orgId: ref.orgId,
    documentId: ref.documentId,
    ciphertext: sealDocumentPassword(secret, ref.orgId, ref.documentId, password),
    expiresAt: new Date(now.getTime() + PASSWORD_TTL_MS),
    createdAt: now,
  };
  await tx
    .insert(documentPasswords)
    .values(values)
    .onConflictDoUpdate({
      target: [documentPasswords.orgId, documentPasswords.documentId],
      set: { ciphertext: values.ciphertext, expiresAt: values.expiresAt, createdAt: now },
    });
}

/** The password entered for this document in the last 15 minutes, if any. Expired rows are removed. */
export async function getDocumentPassword(
  c: Deps,
  ref: DocumentRef,
  now = new Date(),
): Promise<string | undefined> {
  const row = await withOrg(c.database, ref.orgId, async (tx) => {
    await tx
      .delete(documentPasswords)
      .where(and(eq(documentPasswords.orgId, ref.orgId), lt(documentPasswords.expiresAt, now)));
    const [r] = await tx
      .select({ ciphertext: documentPasswords.ciphertext })
      .from(documentPasswords)
      .where(
        and(
          eq(documentPasswords.orgId, ref.orgId),
          eq(documentPasswords.documentId, ref.documentId),
        ),
      )
      .limit(1);
    return r;
  });
  if (!row) return undefined;
  return openDocumentPassword(c.env.AUTH_SECRET, ref.orgId, ref.documentId, row.ciphertext);
}

/** Forget the password once the run is done (or failed). */
export async function clearDocumentPassword(c: Deps, ref: DocumentRef): Promise<void> {
  await withOrg(c.database, ref.orgId, (tx) =>
    tx
      .delete(documentPasswords)
      .where(
        and(
          eq(documentPasswords.orgId, ref.orgId),
          eq(documentPasswords.documentId, ref.documentId),
        ),
      ),
  );
}
