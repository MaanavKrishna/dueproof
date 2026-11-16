<a href="https://dueproof-app.vercel.app"><img src=".github/readme/hero.svg" width="100%" alt="Dueproof. Every deadline in your notices, proved on the page. Dueproof reads tax, regulatory and court notices, finds what's owed and by when, and proves every finding on the page it came from. A sample GST notice has one sentence highlighted: pay the tax of Rs. 4,52,300 with interest within 30 days of receipt of this notice. A line links it to a card: reply due 23 Nov 2026, 30 days from receipt on 24 Oct 2026, computed by the date engine."></a>

<p align="center">
  <a href="https://dueproof-app.vercel.app"><img src="https://img.shields.io/badge/Try_it_live-1F3A8A?style=for-the-badge" alt="Try it live at dueproof-app.vercel.app"></a>
  <a href="https://dueproof.vercel.app"><img src="https://img.shields.io/badge/Website-1F3A8A?style=for-the-badge" alt="Website: dueproof.vercel.app"></a>
  <a href="docs/index.md"><img src="https://img.shields.io/badge/Docs-1F3A8A?style=for-the-badge" alt="Documentation"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/Licence-PolyForm_Shield_1.0.0-B87300?style=for-the-badge&labelColor=15181D" alt="Licence: PolyForm Shield 1.0.0"></a>
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/Version-0.1.0_beta-B87300?style=for-the-badge&labelColor=15181D" alt="Version 0.1.0 beta"></a>
</p>

<p align="center">
  Dueproof reads tax, regulatory and court notices (India first), finds what's owed and by when,<br>
  and proves every finding on the page it came from. A person decides; code computes every date.
</p>

<h2><img src=".github/readme/h-how.svg" width="100%" alt="How it works"></h2>

<img src=".github/readme/how-it-works.svg" width="100%" alt="How a notice becomes a deadline, in seven steps. 1 Upload: drop a PDF or take a photo. 2 Read: the text layer first, then OCR with PaddleOCR and Tesseract, each only if needed. 3 Translate: Indian languages, offline, with IndicTrans2 on your server; the original stays the proof. 4 Find: rules read every notice for duties, amounts and hearings, and return a date rule, never a date. Optional AI (off, local, your own key or the Dueproof plan, routed Haiku, Sonnet, Opus) helps only where rules aren't sure, and its findings pass the same proof gate. 5 Compute: the date engine counts and shows its working. 6 Prove: each finding is outlined on its page; an unlocated finding waits for a person. 7 Track: case, deadline, reminders, calendar and iCal feed.">

A notice arrives by email, through a tax portal, or as a phone photo of a
posted letter. Somewhere in it is a sentence that says what you must do, and a
date, often *"within 30 days of receipt"*, counted from a day nobody wrote
down. Dueproof reads the notice, opens a case for it, and puts each duty in
the deadline register, with the sentence outlined on the page.

<h2><img src=".github/readme/h-features.svg" width="100%" alt="What it does"></h2>

<p align="center">
  <img src=".github/readme/tile-proof.svg" width="65%" alt="01 Proof on the page. Every finding is outlined on the page it came from and graded exact, strong, approximate or unlocated. A finding that can't be found on the page can't become a deadline until a person confirms it.">
  <img src=".github/readme/tile-dates.svg" width="32%" alt="02 Dates are computed, never generated. The quote 'within 30 days of receipt' becomes a date rule: relative, anchor receipt, amount 30, unit days. The date engine turns it into 23 Nov 2026.">
</p>
<p align="center">
  <img src=".github/readme/tile-languages.svg" width="32%" alt="03 Indian languages. Notices in English and the 22 scheduled Indian languages, translated offline by IndicTrans2 on your own server. Translation is tested end to end in Hindi, Tamil, Bengali, Telugu, Malayalam and Urdu.">
  <img src=".github/readme/tile-ocr.svg" width="65%" alt="04 The OCR ladder. The PDF text layer first, then PaddleOCR, then Tesseract with per-language packs, then a vision model when AI is on. A page still below the confidence bar goes to Needs review.">
</p>
<p align="center">
  <img src=".github/readme/tile-register.svg" width="32%" alt="05 Cases and deadlines. Every duty in one register, grouped overdue, this week and later, with a calendar view and an iCal feed.">
  <img src=".github/readme/tile-ai.svg" width="32%" alt="06 AI, your way. Off by default, a local model, your own key, or the Dueproof plan. Routed Haiku, then Sonnet, then Opus only when the proof gate fails. Its findings pass the same proof gate as the rules.">
  <img src=".github/readme/tile-private.svg" width="32%" alt="07 Private by design. Self-hosted, no telemetry and no phone-home, the engine has no network route out, row-level security per organisation, and document text is never logged.">
</p>

Beyond the reading: cases with stages, threads and approval; a review queue;
clients with their registrations and statutory calendar; demand, interest and
penalty estimates; and reports, including an evidence report with page crops.

<h2><img src=".github/readme/h-see.svg" width="100%" alt="See it"></h2>

<img src="docs/images/app-case.png" width="100%" alt="A GST notice open in Dueproof: the case page with its reference, issuing office, amount demanded of 4,52,300 rupees and the next due date, and the page beside it with the sentence outlined and graded Exact.">

<p align="center">
  <img src="docs/images/app-deadlines-list.png" width="49%" alt="The Deadlines screen: overdue items, this week and later, each with its source (notice or statutory calendar) and a coloured due-date label.">
  <img src="docs/images/app-evidence-report.png" width="49%" alt="The evidence report: each finding with its quote, its grade (exact match on the page), its computed due date and a crop of the page it came from, ready to print or save as PDF.">
</p>

<h2><img src=".github/readme/h-run.svg" width="100%" alt="Ways to run it"></h2>

<img src=".github/readme/editions.svg" width="100%" alt="Three ways to run Dueproof. Hosted, run by us at dueproof-app.vercel.app on Vercel, Neon and Cloudflare R2, with plans with or without AI; data is stored in Singapore and Asia-Pacific. Self-hosted, free on your own server with Docker Compose: four containers behind Caddy, no telemetry, nightly backups; the Business edition adds SAML single sign-on from ee/. Desktop, a Tauri 2 app that connects to a server, with OS notifications, a tray, deep links and start at login; it runs on Linux today, and Windows and macOS builds are coming. On a phone, the web app installs as a PWA with camera capture and Web Push.">

| Edition | What you get |
|---|---|
| **Hosted** | Run by us on Vercel, Neon and Cloudflare R2: <https://dueproof-app.vercel.app>. App and database in Singapore, files in Asia-Pacific, not yet in India ([Deployment](docs/deployment.md)). |
| **Self-hosted Free** | Everything that reads, proves and tracks notices, on your own server with Docker Compose. No telemetry, no phone-home. |
| **Self-hosted Business** | Free plus SAML single sign-on, signed audit export and white-label reports, unlocked by an offline licence key ([`ee/`](ee/)). |
| **Desktop** | A Tauri 2 app that connects to your server, with OS notifications and a tray. Linux today; Windows and macOS are coming ([Desktop app](docs/desktop.md)). |
| **Phone** | The web app installs as a PWA, with camera capture and Web Push. |

<h2><img src=".github/readme/h-start.svg" width="100%" alt="Get started"></h2>

### Hosted

Open <https://dueproof-app.vercel.app> to try it. Nothing to install.

### Self-hosted with Docker

On a Linux server with Docker Engine 24+ and the Compose plugin (4 vCPU,
8 GB RAM, 40 GB disk):

```bash
git clone https://github.com/MaanavKrishna/dueproof && cd dueproof/infra/docker
cp .env.example .env
# four secrets, 32+ characters each
for k in AUTH_SECRET ENGINE_SHARED_SECRET POSTGRES_PASSWORD CRON_SECRET; do
  sed -i "s|^$k=.*|$k=$(openssl rand -hex 32)|" .env
done
# set DUEPROOF_DOMAIN in .env to your domain, or localhost for a trial
docker compose up -d --build
```

Open `https://<your domain>` and sign up: the first account owns the
organisation, and after that sign-up is by invitation. Keep a copy of `.env`
somewhere safe, away from the server. The full guide, with email, offline
translation, backups and upgrades, is [Install](docs/install.md).

### Development

You need Node 22+, pnpm 10 and, for the engine, Python with
[uv](https://docs.astral.sh/uv/).

```bash
pnpm install
cp apps/app/.env.example apps/app/.env.local   # set AUTH_SECRET (openssl rand -hex 32)
pnpm dev
```

The app runs at <http://localhost:3000> on embedded Postgres (PGlite) with a
fake engine that answers from the real engine's recordings, so no other
service is needed. To read real documents, run the engine
(`services/engine`) and set `ENGINE_MODE=http`.

```bash
pnpm lint && pnpm typecheck && pnpm test     # every package
pnpm --filter @dueproof/app e2e              # Playwright, on a production build
cd services/engine && uv run python -m unittest discover -s tests -t . -v
```

Read the house rules in [CONTRIBUTING.md](CONTRIBUTING.md) before changing
anything (frozen contracts, computed dates, the proof gate, org-scoped queries).

<h2><img src=".github/readme/h-hood.svg" width="100%" alt="Under the hood"></h2>

<img src=".github/readme/stack.svg" width="100%" alt="Under the hood: one TypeScript monorepo and one Python engine. Browser, desktop app and phone use apps/app (Next.js, server actions, /api/v1), which talks to Postgres with row-level security and calls services/engine (Python, stateless, no database) with a signed, short-lived token. The engine reads and writes file storage (local disk, S3 or R2) through signed links that last five minutes at most. packages/core is the only place a date rule becomes a date. Other packages: contracts, db, ai, auth, storage, ui, tokens and i18n; ee/ holds the Business features under a commercial licence.">

```
apps/app            the product (Next.js)
apps/site           website and docs (Next.js)
apps/desktop        desktop shell (Tauri 2)
services/engine     Python engine: read, OCR, translate, rules, proof
packages/*          contracts, db, core (date engine, policy), ui, tokens,
                    icons, ai, auth, storage, engine-client, i18n, plugins
ee/                 Business features, under a commercial licence
infra/              Docker Compose, Vercel and Sandbox setups
docs/               documentation (also rendered on the website)
```

More in [Architecture](docs/architecture.md).

<h2><img src=".github/readme/h-docs.svg" width="100%" alt="Documentation"></h2>

| Start | Use | Run | Reference |
|---|---|---|---|
| [Overview](docs/index.md) | [Notices](docs/notices.md) | [Deployment](docs/deployment.md) | [API](docs/api.md) |
| [Install](docs/install.md) | [Workflow and reminders](docs/workflow-and-reminders.md) | [Desktop app](docs/desktop.md) | [Architecture](docs/architecture.md) |
| [Quickstart](docs/quickstart.md) | [Languages](docs/languages.md) | [Backup and restore](docs/backup-and-restore.md) | [Evaluation](docs/evaluation.md) |
| | [Notice types](docs/profiles.md) | [Upgrading](docs/upgrading.md) | [FAQ](docs/faq.md) |
| | | [Accounts and SSO](docs/accounts-and-sso.md) · [Configuration](docs/configuration.md) · [Security](docs/security.md) | |

<h2><img src=".github/readme/h-status.svg" width="100%" alt="Status"></h2>

v0.1.0 is in beta. See the [changelog](CHANGELOG.md) and the
[roadmap](ROADMAP.md). Before you rely on Dueproof for real deadlines, run it
beside your current process.

- **Statutory periods and interest rates are data with a source.** Each is
  marked "verify" until a chartered accountant signs it off. Interest and
  penalty figures are estimates, not advice.
- **Languages.** Notices in all 22 scheduled languages are read, stored and
  searchable. Offline translation has been tested end to end in Hindi, Tamil,
  Bengali, Urdu, Telugu and Malayalam; the other 16 use the same path. Scans
  in Indian scripts need the matching Tesseract pack ([Languages](docs/languages.md)).
- **Hosted email** (invitations, password resets, the digest) needs a mail
  provider; until then, copy invite links from Team and access.
- **Hosted pages below the OCR confidence bar** aren't yet sent to the heavy
  engine.
- **Notice languages** are set per organisation, not per client.
- **Desktop** builds are made for Linux; Windows and macOS are coming.
- **Hosted data** is stored in Singapore (database) and Asia-Pacific (files),
  not in India.

<h2><img src=".github/readme/h-contribute.svg" width="100%" alt="Contributing"></h2>

The most useful contributions are a notice Dueproof gets wrong, reduced to a
few invented sentences (never a real document), depth for a language you read,
and a notice type for your kind of organisation. Start with
[CONTRIBUTING.md](CONTRIBUTING.md).

**Found a security problem?** Please report it privately, through the
repository's **Security** tab. See [SECURITY.md](SECURITY.md).

<h2><img src=".github/readme/h-licence.svg" width="100%" alt="Licence"></h2>

[PolyForm Shield 1.0.0](LICENSE). Free to use, self-host, modify and improve.
You may not sell it or offer it as a competing product or service.
Third-party components are listed in [NOTICE](NOTICE).

The exception is the [`ee/`](ee/) directory: the Business features (SAML
single sign-on, audit export, white-label reports and the offline licence
check) are under a [commercial licence](ee/LICENSE) and work only with a valid
Dueproof Business licence. Nothing outside `ee/` depends on it: delete the
directory and you have Self-hosted Free, which builds and runs on its own.

<br>

<a href="https://dueproof-app.vercel.app"><img src=".github/readme/cta.svg" width="100%" alt="Stop copying dates into a spreadsheet. Try Dueproof at dueproof-app.vercel.app, or self-host it free with Docker. PolyForm Shield 1.0.0: free to use, self-host, modify and improve."></a>
