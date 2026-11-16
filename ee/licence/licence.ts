/**
 * Offline licence keys (08 §5, 05 §8).
 *
 * A licence file is a small JSON document:
 *
 *   {
 *     "dueproofLicence": 1,
 *     "keyId": "dueproof-2027",
 *     "payload": "{\"v\":1,\"licenceId\":\"…\",\"licensee\":\"…\",\"orgName\":\"…\",
 *                  \"features\":[\"sso\",\"audit-export\",\"white-label\"],
 *                  \"seats\":25,\"issuedAt\":\"…\",\"expiresAt\":\"…\"}",
 *     "signature": "<base64 Ed25519 signature>"
 *   }
 *
 * The payload is kept as the exact string that was signed, so there is no
 * canonical-JSON step to get wrong. The signature covers
 * `"dueproof-licence-v1\n" + payload` (the prefix keeps the key from signing
 * anything else by accident).
 *
 * Verification is entirely offline: no activation server, no phone-home, no
 * hardware binding. A licence that doesn't verify switches nothing on and
 * blocks nothing in the free product.
 */
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import {
  isBusinessFeature,
  LICENCE_GRACE_DAYS,
  LICENCE_WARNING_DAYS,
  type LicenceExtension,
  LicenceFileError,
  type LicenceInfo,
  type LicenceStatus,
  NO_LICENCE,
  type StoredLicence,
} from "@dueproof/plugins";
import { z } from "zod";
import { type TrustedKey, trustedKeys } from "./keys";

const CONTEXT = "dueproof-licence-v1\n";
const DAY = 24 * 60 * 60 * 1000;
/** Clock drift we forgive before calling it tampering. */
const CLOCK_SLACK = DAY;
const MAX_FILE_BYTES = 16 * 1024;

const isoDate = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), "must be an ISO 8601 date")
  .transform((s) => new Date(s).toISOString());

export const LicencePayload = z
  .object({
    v: z.literal(1),
    licenceId: z.string().min(1).max(100),
    licensee: z.string().min(1).max(200),
    orgName: z.string().min(1).max(200),
    features: z.array(z.string().min(1).max(50)).max(50),
    seats: z.number().int().positive().nullable().optional(),
    issuedAt: isoDate,
    expiresAt: isoDate,
  })
  .refine((p) => Date.parse(p.expiresAt) > Date.parse(p.issuedAt), {
    message: "expiresAt must be after issuedAt",
  });
export type LicencePayload = z.input<typeof LicencePayload>;

const LicenceFile = z.object({
  dueproofLicence: z.literal(1),
  keyId: z.string().optional(),
  payload: z
    .string()
    .min(2)
    .max(8 * 1024),
  signature: z.string().min(16).max(512),
});

function message(payload: string): Buffer {
  return Buffer.from(CONTEXT + payload, "utf8");
}

// ------------------------------------------------------------------ issue (the script and tests)

/** Signs a payload. Used by ee/scripts/issue-licence.ts and the tests; never by the app. */
export function issueLicence(
  payload: LicencePayload,
  privateKeyPem: string,
  keyId: string,
): { file: string; stored: StoredLicence } {
  const parsed = LicencePayload.parse(payload);
  const payloadText = JSON.stringify({
    v: 1,
    licenceId: parsed.licenceId,
    licensee: parsed.licensee,
    orgName: parsed.orgName,
    features: parsed.features,
    seats: parsed.seats ?? null,
    issuedAt: parsed.issuedAt,
    expiresAt: parsed.expiresAt,
  });
  const key = createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("The signing key must be Ed25519.");
  const signature = sign(null, message(payloadText), key).toString("base64");
  const file = `${JSON.stringify({ dueproofLicence: 1, keyId, payload: payloadText, signature }, null, 2)}\n`;
  return { file, stored: { payload: payloadText, signature } };
}

// ------------------------------------------------------------------ read

export function parseLicenceFile(text: string): StoredLicence {
  if (Buffer.byteLength(text, "utf8") > MAX_FILE_BYTES)
    throw new LicenceFileError("That file is too large to be a Dueproof licence.");
  let json: unknown;
  try {
    json = JSON.parse(text.trim());
  } catch {
    throw new LicenceFileError("That isn't a Dueproof licence file. Paste the whole file.");
  }
  const parsed = LicenceFile.safeParse(json);
  if (!parsed.success)
    throw new LicenceFileError("That isn't a Dueproof licence file. Paste the whole file.");
  return { payload: parsed.data.payload, signature: parsed.data.signature };
}

/** The payload, if a trusted key signed it; otherwise null. */
export function verifyStored(
  stored: StoredLicence,
  keys: readonly TrustedKey[],
): LicenceInfo | null {
  let sig: Buffer;
  try {
    sig = Buffer.from(stored.signature, "base64");
  } catch {
    return null;
  }
  if (sig.length !== 64) return null;
  const signed = keys.some((k) => {
    try {
      return verify(null, message(stored.payload), createPublicKey(k.publicKey), sig);
    } catch {
      return false;
    }
  });
  if (!signed) return null;
  let json: unknown;
  try {
    json = JSON.parse(stored.payload);
  } catch {
    return null;
  }
  const parsed = LicencePayload.safeParse(json);
  if (!parsed.success) return null;
  const p = parsed.data;
  return {
    licenceId: p.licenceId,
    licensee: p.licensee,
    orgName: p.orgName,
    features: [...new Set(p.features)],
    seats: p.seats ?? null,
    issuedAt: p.issuedAt,
    expiresAt: p.expiresAt,
  };
}

const ceilDays = (ms: number) => Math.max(0, Math.ceil(ms / DAY));

export function evaluateLicence(
  stored: StoredLicence | null,
  options: { now: Date; latestSeenAt?: Date | null; keys?: readonly TrustedKey[] },
): LicenceStatus {
  if (!stored) return NO_LICENCE;
  const keys = options.keys ?? trustedKeys();
  const info = verifyStored(stored, keys);
  if (!info) {
    return {
      ...NO_LICENCE,
      state: "invalid",
      problem:
        "This licence doesn't check out: it wasn't signed by Dueproof, or it was changed after it was issued.",
    };
  }
  const now = options.now.getTime();
  const expires = Date.parse(info.expiresAt);
  const graceEnds = expires + LICENCE_GRACE_DAYS * DAY;
  const base = {
    licence: info,
    graceEndsAt: new Date(graceEnds).toISOString(),
  };
  const off = (problem: string): LicenceStatus => ({
    ...base,
    state: "expired",
    active: [],
    daysLeft: 0,
    problem,
  });

  if (Date.parse(info.issuedAt) > now + CLOCK_SLACK)
    return off("This licence was issued after today's date. Check this server's clock.");
  const seen = options.latestSeenAt?.getTime();
  if (seen !== undefined && now < seen - CLOCK_SLACK)
    return off(
      "This server's clock is behind the last time it recorded anything, so the licence is treated as expired. Set the clock right.",
    );
  if (now >= graceEnds)
    return off(
      "This licence has expired and its 30 days of grace are over. Business features are off; nothing has been lost.",
    );

  const active = info.features.filter(isBusinessFeature);
  if (now >= expires)
    return {
      ...base,
      state: "grace",
      active,
      daysLeft: ceilDays(graceEnds - now),
      problem: "This licence has expired. Business features stay on until the grace period ends.",
    };
  if (expires - now <= LICENCE_WARNING_DAYS * DAY)
    return { ...base, state: "expiring", active, daysLeft: ceilDays(expires - now), problem: null };
  return { ...base, state: "valid", active, daysLeft: ceilDays(expires - now), problem: null };
}

export const licence: LicenceExtension = {
  parseFile: parseLicenceFile,
  evaluate: (stored, options) => evaluateLicence(stored, options),
};
