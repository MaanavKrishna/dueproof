# Changelog

## 0.1.1 — 2026-11-19 (beta)

A release of fixes. Every screen now fits any window, from a phone to a wide
monitor; reading is stricter about dates, amounts and proof; and a security
review closed the gaps it found. There are about 300 new tests, among them 28
journeys through the app in a real browser.

**Before you upgrade**
- Migration 0007 adds unique keys to findings and deadlines. It runs on start;
  it fails if a document already has duplicate findings or deadlines.
- Hosted engine: set `DUEPROOF_ALLOWED_HOSTS` to your exact storage hosts. With
  it empty, the engine now refuses every fetch (outside development).
- Hosted app: the Dueproof AI plan is now given to the organisations listed in
  `AI_PLAN_ORGS`. `/api/metrics` needs `METRICS_TOKEN` in production.

**Layout**
- Page widths and gutters are tokens, with a `Grid` primitive and page
  templates in `@dueproof/ui`. Pages fill wide screens and reflow on phones,
  with no sideways scrolling at 390 px.
- On a phone the case page opens with the document closed.

**Reading and proof**
- The deadline is the date the duty applies to ("on or before", "adjourned
  to"), not the notice's own date. A sentence with two candidate dates goes to
  review instead of being guessed.
- The demand is read by its words: turnover, refunds and threatened penalties
  are not the demand. Lakh, crore and "Rupees …" forms are read.
- A quote whose numbers differ from the page is *unlocated*, however close its
  words are.
- More date and period forms ("20th day of October, 2026", "within thirty (30)
  days", Hindi month names).
- An AI date its quote doesn't state is dropped. A retried AI step replays its
  answer instead of paying for a second call.

**Security**
- Invitations are joined only through their tokenised link.
- Access limited to some clients is enforced on every document, finding, case,
  deadline and upload action.
- Undoing a bulk change, and filing without partner approval, now check
  permissions. Filing without approval needs a reason and is shown on the case.
- Exports need the export permission; statutory overrides need theirs.
- Uploads are bound to their size and type, and sealed under their hash.
- The engine checks its token before reading a body, limits body size and
  time, refuses compressed bodies, and fetches only from allowed public hosts.
- PDFs are opened in a sandboxed child process with memory, CPU and time
  limits. Image frames, page text and render sizes are capped; emoji and odd
  scans no longer give server errors; OCR has a time limit.
- Actions in CI are pinned to commits, with a dependency audit and Dependabot.

**Fixes**
- Hosted: the app role can be used by a database owner that is not a
  superuser, and uploads to R2 no longer fail on a checksum.
- A sign-up that fails part-way is undone, so the person can try again.
- Viewers aren't offered changes the server refuses; "1 client", not
  "1 clients"; the upload tray's Open always goes somewhere.
- A removed member is told why sign-in doesn't take them in.
- Dialogs lock the page behind them under the content security policy, and
  focus returns where it was when they close.
- Statutory extensions, interest and hearing times corrected.

## 0.1.0 — 2026-11-16 (beta)

Dueproof reads tax, regulatory and court notices in English and 22 Indian
languages, typed or photographed, finds what is owed and by when, and proves
every finding on the page it came from. Cases, deadlines, the statutory
calendar and demand exposure live in one register your whole firm works from.

This is the first release of v0.1, and it is a **beta**. Use it hosted at
<https://dueproof-app.vercel.app>, or self-host it with Docker Compose
([Install](https://github.com/MaanavKrishna/dueproof/blob/main/docs/install.md)); there is also a desktop app that connects to
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
- Settings: Me, Organisation, Team and access, AI, Notice types, Intake, System.
- Notifications, a morning digest by email and escalation, from a daily job.

**Editions**
- Self-hosted: Docker Compose with Caddy, nightly backups, a backup before
  each upgrade. No telemetry.
- Self-hosted Business (`ee/`, commercial licence): offline licence keys, SAML
  single sign-on, signed audit export and white-label reports.
- Hosted: Vercel, Neon and Cloudflare R2.
- Desktop: a Tauri 2 app that connects to one server, with OS notifications,
  a tray, deep links and start at login. Built for Linux in this beta;
  Windows and macOS builds are coming.
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
[roadmap](https://github.com/MaanavKrishna/dueproof/blob/main/ROADMAP.md)'s list for leaving beta.

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
