# API

The web app uses this API; so can you. All responses are JSON unless stated.
With sign-in on, calls need the session cookie (from `POST /api/login`) or your
proxy's user header, and every `POST`/`PATCH` needs the header `X-Dueproof: 1`.

## Documents

| | | |
|---|---|---|
| `POST` | `/api/upload` | multipart: `file` (PDF, JPEG, PNG, TIFF), optional `channel`, `sender`, `received_on` (YYYY-MM-DD). Returns `{doc_id, duplicate}` — identical bytes return the existing document. |
| `GET` | `/api/status/{doc_id}` | `{stage, percent, status, done}` while processing |
| `GET` | `/api/documents?role=&channel=&limit=&offset=` | A page of the queue, newest first; `X-Total-Count` header |
| `GET` | `/api/document/{doc_id}` | The card: notice fields, bullets, obligations, duplicates |
| `PATCH` | `/api/documents/{doc_id}` | `{received_on?, title?}`; receipt-based deadlines move with `received_on` |
| `POST` | `/api/inbox/scan` | Ingest new files in `<data>/inbox/` |
| `GET` | `/api/page/{doc_id}/{n}.jpg` | Page image |

## Obligations

| | | |
|---|---|---|
| `GET` | `/api/deadlines?role=&status=&days=&limit=&offset=` | Dated obligations in due order. `status`: `open` (default), `done`, `dismissed`, `all` |
| `PATCH` | `/api/findings/{id}` | Any of `{status, assignee, due_date, roles, note}`; `null` due date or roles restores what was found |
| `GET` | `/api/findings/{id}/history` | Every change, oldest first |
| `GET` | `/api/export/deadlines.csv` | Same filters; spreadsheet with BOM for Excel |
| `GET` | `/api/export/deadlines.html` | Same filters; printable evidence report |

Each finding carries `due_date` (with any correction), `found_due_date`,
`roles`, `found_roles`, `status`, `assignee`, `note`, `section`, `tag`
(`hearing`), `due_basis` (`receipt:30`), `evidence_quote`, `page`, `rects`
(boxes as fractions of the page, `[x0, y0, x1, y1]`), `confidence`
(`exact`/`strong`/`approximate`/`none`), `orig_lang`, `translated`, `term_flags`.

## Search, people, audit

| | | |
|---|---|---|
| `GET` | `/api/search?q=` | Pages and translated findings matching every term, with rectangles |
| `POST` | `/api/login` · `/api/logout` | `{email, password}` |
| `GET` | `/api/me` · `/api/users` | Who is signed in; who findings can be assigned to |
| `GET` | `/api/audit?doc_id=&action=` | The audit trail, newest first |
| `GET` | `/api/meta` · `/api/version` · `/health` | Settings for the app; version; liveness |
