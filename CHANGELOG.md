# Changelog

## 0.1.0 — 2026-11-16 (beta)

Dueproof reads tax, regulatory and court notices in English and 22 Indian
languages, typed or photographed, finds what is owed and by when, and proves
every finding on the page it came from. Cases, deadlines, the statutory
calendar and demand exposure live in one register your whole firm works from.

This is the first release of v0.1, and it is a **beta**. Use it hosted at
<https://dueproof-app.vercel.app>, or self-host it with Docker Compose
([Install](docs/install.md)); there is also a desktop app that connects to
your server. Run it beside your current process before you rely on it for
real deadlines: statutory periods and rates are marked "verify" until a
chartered accountant signs them off, and interest and penalty figures are
estimates, not advice.

v0.1 is a full rebuild. Nothing is carried over from
the demo's code except the engine's reading, OCR, translation, rules and
proof-linking.

**Platform**
- A TypeScript monorepo (pnpm, Turborepo): the app on Next.js, the website,
  shared packages, and one Python service, the engine.
- Postgres everywhere: Postgres in Docker when self-hosted, Neon when hosted,
  PGlite (embedded) in development, tests and the desktop edition. One set of
  migrations; row-level security on every tenant table.
- The engine is a stateless HTTP service with an OCR ladder (text layer,
  PaddleOCR, Tesseract) and offline translation (IndicTrans2). It reads files
  through short-lived signed URLs and has no network route out when
  self-hosted. On hosted, a step that sends pages it can't read to
  engine-heavy in a Vercel Sandbox is built, but off in this beta.
- Processing runs as a durable workflow: inspect, read, translate, analyse,
  link, AI assist, reconcile, resolve dates, write.
- Password-protected PDFs wait for their password, which is kept encrypted for
  one run (15 minutes at most) and deleted when processing ends.

**Reading and proof**
- Findings come from rules; each is linked to its page and graded *exact*,
  *strong*, *approximate* or *unlocated*. Unlocated findings can't become
  deadlines until a person confirms them.
- Dates come only from the date engine in `@dueproof/core`, with the holiday
  calendar and the working kept on the deadline.
- Optional AI: off, a local model, your own key, or (hosted) the Dueproof AI
  plan. AI runs only where the rules aren't confident, within a monthly budget,
  and its findings pass the same proof gate; when rules and AI disagree, both
  readings go to review.

**Screens**
- Sign-in, sign-up and password reset; a first-run setup wizard.
- Today, Inbox (upload tray with live status, review queue with keyboard
  shortcuts, filing into cases), Notices (filters, saved views, bulk actions,
  CSV), the case page (stage bar, thread with mentions, duties with proof,
  demand and interest, activity), Search.
- Deadlines (list by week, calendar and timeline; mark done, reassign, snooze
  with undo; manual deadlines; a signed iCal feed) and the statutory
  compliance calendar from each client's registrations.
- Clients (CSV import with GSTIN and PAN checks, merging duplicates, a client
  page with registrations, contacts, cases, deadlines and exposure).
- Reports: evidence report with page crops, client statement, workload,
  exposure and hearing pack, for A4 print and CSV.
- Settings: Me, Organisation, Team and access, AI, Profiles, Intake, System.
- Notifications, a morning digest by email and escalation, from a daily job.

**Editions**
- Self-hosted: Docker Compose with Caddy, nightly backups, a backup before
  each upgrade. No telemetry.
- Self-hosted Business (`ee/`, commercial licence): offline licence keys, SAML
  single sign-on, signed audit export and white-label reports.
- Hosted: Vercel, Neon and Cloudflare R2.
- Desktop: a Tauri 2 app for Windows, macOS and Linux that connects to one
  server, with OS notifications, a tray, deep links and start at login.
- Phone: the web app installs as a PWA, with camera capture and Web Push.

**Licence**
- Dueproof is now under the PolyForm Shield License 1.0.0. You may use it,
  self-host it, change it and improve it for free. You may not sell it or
  offer it as a competing product or service. `ee/` keeps its commercial
  licence.

**Design and quality**
- Ledger, a new design system: tokens, components with Storybook, light and
  dark themes, and Motion presets.
- Unit and integration tests in every package, a tenant-isolation suite,
  Playwright end-to-end tests with axe-core accessibility checks on every main
  screen, and an AI eval that fails on any confidently wrong outline.

**Known limitations**

Read these before you rely on the beta. Most are on the
[roadmap](ROADMAP.md)'s list for leaving beta.

- **Statutory data is not yet verified.** Every statutory period and rate is
  data with a source, marked "verify" until a chartered accountant signs it
  off. The app says so beside each such deadline.
- **No published accuracy on real notices yet.** The evaluation runs on a
  small set of invented fixtures; precision, recall and deadline accuracy on
  a labelled set of real GST, income-tax and TDS notices come before the
  beta ends.
- **Email needs configuring on hosted.** Invitations, password resets and the
  morning digest need a mail provider; until then, copy invite links from
  Team and access.
- **Desktop is Linux-only for now.** Windows and macOS builds, signed, come
  before the beta ends.
- **Hosted data is in Singapore** (database) and Asia-Pacific (files), not
  in India.
- **engine-heavy is off on hosted.** Pages the fast engine can't read
  confidently aren't yet sent to Tesseract and offline translation; they go
  to the review queue instead. Self-hosted runs the full engine.
- Notice languages are set per organisation, not per client.
- No independent security test (VAPT) of the hosted edition yet.

## Demo (0.0.1) — 2026-10-24

The proof-of-concept, now labelled the demo. It was first published as
"0.1.0"; that number now belongs to the full rebuild.

First public version (the demo).

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
