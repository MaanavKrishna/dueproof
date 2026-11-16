/**
 * Passwords for protected PDFs (01 §4 "When things go wrong"): entered once,
 * held in this process's memory for one read, never stored or logged
 * (05 §4). The pipeline's inspect and read stages take the password with
 * `takeDocumentPassword(ref)` and pass it to the engine.
 */
import "server-only";

const TTL_MS = 10 * 60_000;
const KEY = Symbol.for("dueproof.documentPasswords");
type Vault = Map<string, { password: string; expires: number }>;

function vault(): Vault {
  const g = globalThis as { [KEY]?: Vault };
  g[KEY] ??= new Map();
  return g[KEY];
}

const keyOf = (orgId: string, documentId: string) => `${orgId}:${documentId}`;

export function putDocumentPassword(
  orgId: string,
  documentId: string,
  password: string,
  now = Date.now(),
): void {
  vault().set(keyOf(orgId, documentId), { password, expires: now + TTL_MS });
}

/** The password for this read, if one was entered in the last ten minutes. Kept until expiry so read can use it after inspect. */
export function peekDocumentPassword(
  ref: { orgId: string; documentId: string },
  now = Date.now(),
): string | undefined {
  const k = keyOf(ref.orgId, ref.documentId);
  const v = vault().get(k);
  if (!v) return undefined;
  if (v.expires < now) {
    vault().delete(k);
    return undefined;
  }
  return v.password;
}

/** Forget the password once the read is done (or failed). */
export function takeDocumentPassword(ref: {
  orgId: string;
  documentId: string;
}): string | undefined {
  const p = peekDocumentPassword(ref);
  vault().delete(keyOf(ref.orgId, ref.documentId));
  return p;
}
