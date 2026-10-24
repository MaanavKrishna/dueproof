# Changelog

## 0.1.0 — 2026-10-24

First public version.

**Reading**
- PDFs through PDFium; phone photos (JPEG, PNG, multi-page TIFF) through
  Tesseract with deskew and map-back; page rotation honoured.
- English and 22 Indian languages: non-English sentences are translated locally
  before analysis, so a language needs no hand-written vocabulary.

**Understanding notices**
- Obligations, deadlines, hearings, desks, severity; reference, issuing office,
  amount demanded, provisions cited.
- Deadlines "from receipt" count from the received date, which can be corrected.
- Profiles: `notices_in` (default), `general`, `hospital`, `municipality`,
  `metro_rail_ml`.

**Proving it**
- Every finding outlined on its page, per line (per segment on tilted scans);
  no box when a passage cannot be located.
- Printable evidence report; CSV export; full-text search with outlined hits.

**Working it**
- Sign-in (local accounts or an SSO proxy), CSRF protection, security headers.
- Status, owner, corrected dates and desks, notes, append-only history.
- Reminder digests by email.

**Running it**
- `dueproof` command: serve, ingest, users, digest, eval, labels, backup,
  verify, restore, doctor, fetch-model.
- Evaluation harness with an accuracy gate in CI.
- systemd units, Docker and Compose with Caddy.
- Documents are processed two at a time; all PDFium calls are serialised,
  since PDFium is not thread-safe and parallel renders could crash the process.

**Project**
- Package laid out by job: `pipeline/`, `ingest.py`, `records.py`, `web/`
  (API and browser app), `tools/` (operator commands). See
  [Architecture](docs/architecture.md).
- A project website in `website/` (Next.js, static export) whose documentation
  pages are rendered from `docs/`.
