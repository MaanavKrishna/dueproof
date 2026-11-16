/**
 * The storage port (03 §3, 05 §5). Originals and page images live under
 * per-organisation keys, `org/{orgId}/…`, and leave or enter the system only
 * through signed URLs that last at most five minutes. The engine never holds
 * storage credentials: it gets one signed URL per object it needs.
 */

/** Signed URLs never outlive this (05 §2: ≤ 5-minute signed URLs). */
export const MAX_SIGNED_URL_SECONDS = 300;

export interface SignedUrl {
  url: string;
  method: "GET" | "PUT";
  /** Headers the caller must send with the request (e.g. content-type for a PUT). */
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface PutOptions {
  contentType?: string;
}

export interface SignOptions {
  /** Seconds; clamped to MAX_SIGNED_URL_SECONDS. Default 300. */
  expiresIn?: number;
}

export interface PutSignOptions extends SignOptions {
  contentType?: string;
  /** Refuse bodies larger than this (local adapter enforces; S3 relies on the declared size check at complete). */
  maxBytes?: number;
}

export interface ObjectInfo {
  size: number;
  contentType?: string | undefined;
}

export interface StoragePort {
  readonly kind: "local" | "s3" | "vercel-blob" | "memory";
  put(key: string, body: Uint8Array, options?: PutOptions): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  head(key: string): Promise<ObjectInfo | null>;
  delete(key: string): Promise<void>;
  putSignedUrl(key: string, options?: PutSignOptions): Promise<SignedUrl>;
  getSignedUrl(key: string, options?: SignOptions): Promise<SignedUrl>;
}

export class StorageKeyError extends Error {
  override name = "StorageKeyError";
}

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._=-]{0,199}$/;

/** Build a key under an organisation: orgKey("o1", "originals", "ab12.pdf") → "org/o1/originals/ab12.pdf". */
export function orgKey(orgId: string, ...parts: string[]): string {
  const key = ["org", orgId, ...parts].join("/");
  assertKey(key);
  return key;
}

/** Throws unless `key` is a well-formed org key (no traversal, no empty or dot segments). */
export function assertKey(key: string, orgId?: string): void {
  const parts = key.split("/");
  if (parts.length < 3 || parts[0] !== "org")
    throw new StorageKeyError("storage keys start with org/{orgId}/");
  for (const p of parts.slice(1)) {
    if (!SEGMENT.test(p) || p === "." || p === "..")
      throw new StorageKeyError(`bad key segment: ${JSON.stringify(p)}`);
  }
  if (orgId !== undefined && parts[1] !== orgId)
    throw new StorageKeyError("key belongs to another organisation");
}

/** The organisation a key belongs to. */
export function keyOrg(key: string): string {
  assertKey(key);
  return key.split("/")[1] as string;
}

export function clampExpiry(expiresIn: number | undefined): number {
  const s = Math.floor(expiresIn ?? MAX_SIGNED_URL_SECONDS);
  if (!Number.isFinite(s) || s <= 0) return MAX_SIGNED_URL_SECONDS;
  return Math.min(s, MAX_SIGNED_URL_SECONDS);
}
