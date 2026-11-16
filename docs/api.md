# API

Most of Dueproof v0.1 runs on Next.js server actions, which aren't a public
API. The HTTP routes below are the ones the app's own pages and the desktop
app call. They use the signed-in session cookie; v0.1 has no API keys yet.

Rules for every route that needs a session:

- It checks the person's role for the action and works only inside their
  organisation.
- A `POST` must come from the app's own origin (the `Origin` header, or
  `Sec-Fetch-Site: same-origin`), or from one in `AUTH_TRUSTED_ORIGINS`.
  Anything else gets 403 `csrf`.
- Errors are JSON: `{ "error": "<code>", "message": "<plain words>" }`.

## Uploading

An upload has three steps, so the file goes straight to storage and never
through the app.

| | | |
|---|---|---|
| `POST` | `/api/v1/uploads` | JSON `{ filename, size, mime, sha256, receivedOn?, role?, caseId?, clientId? }`. `mime`: PDF, JPEG, PNG or TIFF. `receivedOn` is `YYYY-MM-DD` (default: today in the organisation's time zone). Answers 201 `{ status: "upload", documentId, upload }` with a signed PUT link that expires within 5 minutes, or 200 `{ status: "duplicate", documentId }` if the organisation already has the same file |
| `PUT` | the `upload` link | The file's bytes |
| `POST` | `/api/v1/uploads/{id}/complete` | Checks the stored file's size, SHA-256 and real type, then starts the workflow. 422 if the file was quarantined |

Too large: 413 `too_large` (over `UPLOAD_MAX_BYTES`). Wrong type: 415
`unsupported_type`. Too many: 429.

## Documents

| | | |
|---|---|---|
| `GET` | `/api/v1/documents/{id}` | The document with its findings, proof, deadlines and history |
| `GET` | `/api/v1/documents/{id}/events` | Server-sent events: `event: status` with `{ status, detail, at }` on each change, until it is `ready`, `needs_review`, `needs_password`, `failed` or `quarantined` |

## Reports and calendars

| | | |
|---|---|---|
| `GET` | `/api/v1/reports/deadlines.csv` | With the Deadlines filters: `client`, `person`, `type`, `status`, `source` (comma separated) |
| `GET` | `/api/v1/reports/clients.csv` | |
| `GET` | `/api/v1/reports/workload.csv` | |
| `GET` | `/api/v1/reports/exposure.csv` | |
| `GET` | `/api/v1/reports/statement.csv?client=` | |
| `GET` | `/api/v1/reports/evidence.csv?case=` · `?client=` · `?range=YYYY-MM-DD..YYYY-MM-DD` | |
| `GET` | `/api/v1/calendar/{token}.ics` | A calendar feed. The token is the authorisation (no session); make one with **Subscribe (iCal)** |
| `GET` | `/api/v1/audit-export?from=&to=&format=jsonl\|csv&part=records\|report` | Business, owners and admins: the audit trail with its hash chain, or its verification report |

CSV files are UTF-8 with a byte-order mark, so Excel reads ₹ and Indian
scripts.

## Sign-in

`/api/auth/*` is Better Auth: sign-up and sign-in with email and password
(`/api/auth/sign-up/email`, `/api/auth/sign-in/email`), passkeys, two-step
verification, sessions and, on Business, SAML. The app's pages use Better
Auth's own client.

## Operations

| | | |
|---|---|---|
| `GET` | `/api/health` | Database and engine reachability and timings, version, edition. 200 (`ok` or `degraded`) or 503 (`down`). Self-hosted: refused by Caddy, so call it from the server |
| `GET` | `/api/metrics` | Prometheus text. From the server itself, or with `Authorization: Bearer <METRICS_TOKEN>` |
| `GET` | `/api/cron/daily` | The daily reminder run, with `Authorization: Bearer <CRON_SECRET>`. 404 when `CRON_SECRET` is unset. See [Workflow and reminders](workflow-and-reminders.md#the-daily-run) |
| `GET`, `PUT` | `/api/storage/local` | Signed file links when files are on the server's disk. The link's token is the authorisation |

The engine's own API (`services/engine`) is described in
[`services/engine/README.md`](../services/engine/README.md). Only the app
calls it.
