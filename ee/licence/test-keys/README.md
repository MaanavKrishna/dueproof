# TEST KEYS — NOT FOR PRODUCTION

These Ed25519 key pairs exist only so the tests and a local development
server can issue and check licences. Their private keys are public (they are
in this repository), so a licence signed with them proves nothing.

- `test-current.*` — trusted only when `NODE_ENV=test`, or when
  `DUEPROOF_LICENCE_TEST_KEYS=1` is set and `NODE_ENV` is not `production`.
  A production build (`next build` / `next start`) never trusts it.
- `test-other.*` — trusted by nothing; the "wrong key" fixture.

The real signing keys are generated offline (`pnpm --filter @dueproof/ee
licence keygen`), kept on a hardware key, and never committed: `*.private.pem`
is in `.gitignore` everywhere except this folder. Only their public halves go
into `ee/licence/keys.ts`.
