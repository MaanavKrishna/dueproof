/**
 * Envelope encryption for BYOK keys (04 §7, 05 §6, §9).
 *
 *   master key (env AI_KEY_MASTER, 32 bytes base64)
 *     └─ wraps a per-org data key (AES-256-GCM, AAD = "dek:" + orgId)
 *          └─ encrypts the provider key (AES-256-GCM, AAD = "key:" + orgId)
 *
 * The stored value (`ai_settings.encrypted_key`) is one self-contained
 * envelope string; the org id is bound in as AAD so an envelope copied to
 * another org fails to open. Rotating the master key re-wraps the data key
 * only. Decrypt only inside the server-side step that makes the call, and
 * never log the result.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;

export class KeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeyError";
  }
}

/** Read and check the master key. Throws without echoing the value. */
export function loadMasterKey(env: Record<string, string | undefined> = process.env): Buffer {
  const raw = env.AI_KEY_MASTER;
  if (!raw) throw new KeyError("AI_KEY_MASTER is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new KeyError("AI_KEY_MASTER must be 32 bytes, base64-encoded");
  return key;
}

/** A fresh master key, base64 (for setup scripts and tests). */
export function generateMasterKey(): string {
  return randomBytes(32).toString("base64");
}

function seal(key: Buffer, plaintext: Buffer, aad: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ct].map((b) => b.toString("base64url")).join(".");
}

function open(key: Buffer, sealed: string, aad: string): Buffer {
  const parts = sealed.split(".");
  if (parts.length !== 3) throw new KeyError("malformed envelope");
  const [iv, tag, ct] = parts.map((p) => Buffer.from(p, "base64url")) as [Buffer, Buffer, Buffer];
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    throw new KeyError("envelope could not be opened (wrong key, org or tampered)");
  }
}

export interface EncryptedKey {
  /** Store in `ai_settings.encrypted_key`. */
  ciphertext: string;
  /** Store in `ai_settings.key_last4`; show as `maskKey(last4)`. */
  last4: string;
}

/** Encrypt a provider key for an org under a fresh data key. */
export function encryptApiKey(apiKey: string, orgId: string, master: Buffer): EncryptedKey {
  if (!apiKey.trim()) throw new KeyError("empty key");
  const dek = randomBytes(32);
  const wrapped = seal(master, dek, `dek:${orgId}`);
  const body = seal(dek, Buffer.from(apiKey, "utf8"), `key:${orgId}`);
  dek.fill(0);
  return { ciphertext: `${VERSION}~${wrapped}~${body}`, last4: apiKey.slice(-4) };
}

function splitEnvelope(ciphertext: string): { wrapped: string; body: string } {
  const [version, wrapped, body] = ciphertext.split("~");
  if (version !== VERSION || !wrapped || !body) throw new KeyError("unknown envelope version");
  return { wrapped, body };
}

/** Decrypt. Call only in the AI call path; keep the result in memory only. */
export function decryptApiKey(ciphertext: string, orgId: string, master: Buffer): string {
  const { wrapped, body } = splitEnvelope(ciphertext);
  const dek = open(master, wrapped, `dek:${orgId}`);
  try {
    return open(dek, body, `key:${orgId}`).toString("utf8");
  } finally {
    dek.fill(0);
  }
}

/** Re-wrap the data key under a new master key; the key body is untouched. */
export function rewrapApiKey(
  ciphertext: string,
  orgId: string,
  oldMaster: Buffer,
  newMaster: Buffer,
): string {
  const { wrapped, body } = splitEnvelope(ciphertext);
  const dek = open(oldMaster, wrapped, `dek:${orgId}`);
  try {
    return `${VERSION}~${seal(newMaster, dek, `dek:${orgId}`)}~${body}`;
  } finally {
    dek.fill(0);
  }
}

/** "sk-…abcd" for display. */
export function maskKey(last4: string | null | undefined, prefix = "sk-"): string {
  return last4 ? `${prefix}…${last4}` : "";
}
