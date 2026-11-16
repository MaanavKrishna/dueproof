/**
 * The public keys a licence may be signed with (08 §5). The app ships two:
 * the current key and the next one, so the signing key can be replaced by a
 * normal release. Private keys are never in the repository.
 *
 * Before the first Business release: generate both production key pairs
 * offline (`pnpm --filter @dueproof/ee licence keygen --out <dir>`), keep the
 * private halves on a hardware key, and paste the public halves below.
 */

export interface TrustedKey {
  id: string;
  /** SPKI PEM. */
  publicKey: string;
}

/** Production keys. Empty until the owner generates them (see above). */
export const PRODUCTION_KEYS: readonly TrustedKey[] = [
  // { id: "dueproof-2027", publicKey: "-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----\n" },
  // { id: "dueproof-2028", publicKey: "…" },
];

/** TEST ONLY: the private half is in ee/licence/test-keys. Never trusted in production. */
export const TEST_KEY: TrustedKey = {
  id: "test-current",
  publicKey:
    "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAlAuSqEhiUy0Ht5bFBUUJukhfiL/pRza8Ytjf2j1JuEY=\n-----END PUBLIC KEY-----\n",
};

/**
 * The test key is trusted under `NODE_ENV=test`, or with
 * `DUEPROOF_LICENCE_TEST_KEYS=1` outside production. A production server
 * never trusts it, whatever else is set.
 */
export function testKeyAllowed(env: Record<string, string | undefined> = process.env): boolean {
  if (env.NODE_ENV === "production") return false;
  return env.NODE_ENV === "test" || env.DUEPROOF_LICENCE_TEST_KEYS === "1";
}

export function trustedKeys(env: Record<string, string | undefined> = process.env): TrustedKey[] {
  return testKeyAllowed(env) ? [...PRODUCTION_KEYS, TEST_KEY] : [...PRODUCTION_KEYS];
}
