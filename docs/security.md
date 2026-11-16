# Security

To report a vulnerability, see [SECURITY.md](../SECURITY.md).

## Built in

**Accounts.** Passwords hashed with Argon2id, passkeys, two-step
verification with an authenticator app, sessions in HttpOnly cookies,
SAML single sign-on on Business. See
[Accounts and sign-in](accounts-and-sso.md).

**Who sees what.** Every page, server action and API route checks the
person's role before doing anything. Every database query runs inside the
person's organisation, and Postgres row-level security enforces the same
boundary underneath. Owners and admins can limit a person to some clients.

**Requests.** Anything that changes data must come from the app's own
origin. Sign-in, sign-up, uploads, search, exports and AI are rate-limited
per address, person and organisation, with the counters in Postgres.

**Headers.** A strict Content Security Policy (a fresh nonce on every page,
`strict-dynamic`, no framing), HSTS (with preload on hosted),
`Referrer-Policy: same-origin`, a restrictive `Permissions-Policy` and
`X-Content-Type-Options: nosniff`.

**Uploads.** Files go straight to storage through signed links that expire
within 5 minutes. After the upload, the app reads the file back and checks
its size, fingerprint and real type; a file that doesn't match is removed
and the document is held as quarantined. The engine sniffs every file
itself and has caps on size, pages and pixels.

**The engine.** It is the only part that opens uploaded files. It holds no
database access and no storage keys, accepts only short-lived signed
tokens, and fetches only from allowed hosts. On a self-hosted server it has
no network route out at all; on hosted, engine-heavy runs in a Sandbox that
can reach only the storage host. Translation runs on your server with
hash-checked model weights and no network.

**Secrets and logs.** Logs never hold document text, keys or tokens. An
organisation's own AI key is encrypted with `AI_KEY_MASTER` and only its
last four characters are ever shown. A password for a protected PDF is kept
encrypted for one read, then deleted. Web Push messages carry a generic line
only.

**Exports.** CSV cells that a spreadsheet would run as a formula are
defused. Calendar feeds carry titles and dates only, and can be revoked.

**Audit trail.** Changes are recorded with who made them and when, each
entry chained to the one before, so an edit or deletion shows.
**Settings → System → Audit trail** checks the chain. Business adds an export
of the trail, with its hash chain and a verification report.

**No phone-home.** No telemetry, no usage data, no update checks.
**Settings → System → Network** lists every host the install connects to.

## Your job

- On a self-hosted server: keep the server and Docker patched, keep
  `.env` safe and backed up separately (it holds `AUTH_SECRET`), copy
  backups off the machine, and rebuild the images for security updates.
  See [Install](install.md) and [Backup and restore](backup-and-restore.md).
- Don't publish the app, engine or Postgres ports directly. Caddy is the
  only way in.
- Set `DUEPROOF_DEV_PAGES=0` and never use `ENGINE_MODE=fake` in
  production (the app refuses to start with it).

## Not yet in v0.1

- Malware scanning of uploads.
- Encryption at rest beyond what your disk, Neon or R2 provides.
- Per-document access control (access is per organisation and per client).
