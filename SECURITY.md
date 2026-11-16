# Security

## Reporting a vulnerability

Please don't open a public issue, discussion or pull request for a
security problem.

1. Report it privately through GitHub: the repository's **Security** tab,
   **Report a vulnerability**.
2. Include the version (or commit), how you run Dueproof (self-hosted,
   hosted or desktop), the steps to reproduce, and what an attacker gains.
   Don't include real notices or client data; a made-up document is enough.
3. You should get an acknowledgement within a few days. We keep you told as we confirm
   and fix it. Once a fix is released we publish an advisory and credit you,
   unless you'd rather we didn't.

Please give us a reasonable time to fix a problem before you talk about it
publicly, and test only against an install you run yourself.

### Supported versions

Security fixes go into the latest v0.1 release. Upgrade to it before
reporting; see [Upgrading](docs/upgrading.md).

## How Dueproof protects your data

In short (the full list is in [docs/security.md](docs/security.md)):

- **Accounts:** Argon2id passwords, passkeys, two-step verification,
  HttpOnly session cookies; SAML single sign-on on Business. Sign-in,
  sign-up and password resets are rate-limited.
- **Who sees what:** every page, server action and API route checks the
  person's role first; every query runs inside their organisation, with
  Postgres row-level security underneath. Access can be limited per client.
- **Uploads and the engine:** files go straight to storage through
  short-lived signed links and are checked after upload. The engine, the
  only part that opens uploaded files, has no database access, no storage
  keys and, self-hosted, no network route out.
- **Secrets and logs:** logs never hold document text, keys or tokens.
  Organisations' own AI keys are encrypted at rest.
- **Audit trail:** every change is recorded in a hash-chained trail that
  shows any edit or deletion.
- **No phone-home:** no telemetry, usage data or update checks.

## What you look after

On a self-hosted server: keep the server and Docker patched, keep `.env`
safe and backed up away from the server, copy backups off the machine, and
publish only Caddy's ports (80 and 443). What isn't in v0.1 yet, such as
malware scanning of uploads, is listed in
[docs/security.md](docs/security.md#not-yet-in-v01).
