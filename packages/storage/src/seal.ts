/**
 * Sealing an upload (05 §3a). The browser PUTs to an *incoming* key with a
 * signed URL bound to the exact size and content type. To finish, the
 * object is copied to its final key, which no signed PUT ever named, and
 * only then is the copy measured and hashed, streaming, never whole in
 * memory. Whatever happens to the incoming key afterwards (the PUT URL lives
 * five minutes), the final object is the one that was checked, so the
 * engine reads exactly the bytes whose SHA-256 is on record.
 *
 *   incoming: org/{orgId}/incoming/{documentId}   (signed PUT, deleted on seal)
 *   final:    org/{orgId}/originals/{sha256}      (no signed PUT, ever)
 */
import { createHash } from "node:crypto";
import { orgKey, type StoragePort } from "./port";

/** Where the browser uploads a document before it is checked. */
export function incomingKey(orgId: string, documentId: string): string {
  return orgKey(orgId, "incoming", documentId);
}

export interface SealExpectation {
  /** The size declared when the upload started, in bytes. */
  size: number;
  /** The SHA-256 declared when the upload started, lowercase hex. */
  sha256: string;
  /** The install's upload cap, in bytes. */
  maxBytes: number;
}

export type SealOutcome =
  | { ok: true; size: number; sha256: string; head: Uint8Array }
  | { ok: false; problem: "not_uploaded" | "too_large" | "size_mismatch" | "hash_mismatch" };

/** How many leading bytes to return for magic-number checks. */
const HEAD_BYTES = 1024;

/**
 * Copy `from` to `to`, then check the copy. On any mismatch both objects
 * are deleted. A crash after the copy is safe to retry: with `from` gone,
 * an existing `to` is checked as it is.
 */
export async function sealUpload(
  storage: StoragePort,
  from: string,
  to: string,
  expect: SealExpectation,
): Promise<SealOutcome> {
  const incoming = await storage.head(from);
  if (incoming) {
    // Size first, from the object's metadata, before reading a byte.
    if (incoming.size > expect.maxBytes) {
      await storage.delete(from);
      return { ok: false, problem: "too_large" };
    }
    if (incoming.size !== expect.size) {
      await storage.delete(from);
      return { ok: false, problem: "size_mismatch" };
    }
    await storage.copy(from, to);
    await storage.delete(from);
  }
  const sealed = await storage.head(to);
  if (!sealed) return { ok: false, problem: "not_uploaded" };
  if (sealed.size !== expect.size || sealed.size > expect.maxBytes) {
    await storage.delete(to);
    return { ok: false, problem: sealed.size > expect.maxBytes ? "too_large" : "size_mismatch" };
  }
  const stream = await storage.getStream(to);
  if (!stream) return { ok: false, problem: "not_uploaded" };
  const hash = createHash("sha256");
  const head = new Uint8Array(Math.min(HEAD_BYTES, expect.size));
  let read = 0;
  for await (const chunk of stream) {
    if (read < head.length) head.set(chunk.subarray(0, head.length - read), read);
    read += chunk.byteLength;
    if (read > expect.size) break;
    hash.update(chunk);
  }
  if (read !== expect.size) {
    await storage.delete(to);
    return { ok: false, problem: "size_mismatch" };
  }
  const sha256 = hash.digest("hex");
  if (sha256 !== expect.sha256) {
    await storage.delete(to);
    return { ok: false, problem: "hash_mismatch" };
  }
  return { ok: true, size: read, sha256, head };
}
