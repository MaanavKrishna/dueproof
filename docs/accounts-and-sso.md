# Accounts and single sign-on

`DUEPROOF_AUTH` chooses how people sign in.

## `local` (default): accounts kept by Dueproof

```bash
dueproof users add asha@example.org --name "Asha Menon" --desk "Direct Tax" --admin
dueproof users list
dueproof users reset asha@example.org      # new password; ends their sessions
dueproof users disable ravi@example.org    # signs them out everywhere
dueproof users enable ravi@example.org
```

Passwords are at least 10 characters and stored as scrypt hashes. A session is
a random token in an HttpOnly, SameSite=Strict cookie, valid for
`DUEPROOF_SESSION_DAYS` (default 7); the database holds only its SHA-256, so a
copy of the database yields no live sessions. Five wrong passwords for one
address from one client lock that pair out for ten minutes.

The cookie is marked Secure. Browsers accept that on `localhost`; anywhere else,
serve Dueproof over HTTPS (see [Deployment](deployment.md)). On a trusted
network over plain HTTP, set `DUEPROOF_SECURE_COOKIES=0`.

## `proxy`: your identity provider

Put Dueproof behind a proxy that signs people in — oauth2-proxy, Pomerium,
Authelia, Cloudflare Access, an nginx `auth_request` setup — and have it pass
the user's email in a header:

```bash
DUEPROOF_AUTH=proxy DUEPROOF_AUTH_HEADER=X-Forwarded-User dueproof serve --host 127.0.0.1
```

Every API call must carry that header; its value is who the audit trail says
acted. **The proxy must strip that header from incoming requests**, and
Dueproof's port must be reachable only from the proxy — otherwise anyone can
claim to be anyone.

To give proxy users a name and a default desk, create their accounts without a
password: `dueproof users add asha@example.org --desk "Direct Tax" --no-password`.

## `none`: no sign-in

For a laptop. Anyone who can reach the port sees and changes everything;
`dueproof doctor` warns about it.

## What is protected

Every `/api/` call except sign-in itself, `/api/meta`, `/api/version` and
`/api/me` needs a signed-in user. Every state-changing call must also carry an
`X-Dueproof: 1` header (the web app sends it); a browser will not attach a
custom header to a cross-site request without a CORS preflight, which Dueproof
never grants. That is the CSRF defence.

Everyone signed in can see every document. Per-document access control is on
the [roadmap](../ROADMAP.md).
