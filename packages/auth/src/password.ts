/**
 * Password hashing: Argon2id (05 §2), not Better Auth's default scrypt.
 *
 * Parameters follow the OWASP minimum for Argon2id (19 MiB, 2 passes, 1 lane).
 * Hashes are PHC strings ("$argon2id$v=19$m=19456,t=2,p=1$…"). `verify` also
 * accepts Better Auth's scrypt format ("salt:key"), so accounts made before
 * this setting, or imported, still sign in.
 *
 * Uses @node-rs/argon2 (prebuilt native binaries, no install scripts). In
 * Next.js it must be listed in `serverExternalPackages`.
 */
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { verifyPassword as scryptVerify } from "better-auth/crypto";

export const ARGON2ID = {
  algorithm: 2, // Algorithm.Argon2id (a const enum, so not importable under verbatimModuleSyntax)
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return argonHash(password, ARGON2ID);
}

export async function verifyPassword({
  hash,
  password,
}: {
  hash: string;
  password: string;
}): Promise<boolean> {
  if (hash.startsWith("$argon2")) {
    try {
      return await argonVerify(hash, password);
    } catch {
      return false;
    }
  }
  return scryptVerify({ hash, password });
}
