<div align="center">

<img src="docs/images/mark.svg" width="72" alt="">

# Dueproof

**Every due date in your notices, with proof from the page.**

Dueproof reads tax, regulatory and court notices in English and 22 Indian
languages, typed or photographed, finds what is owed and by when, and proves
every finding on the page it came from. Cases, deadlines, the statutory
calendar and demand exposure live in one register your whole firm works from.

[![tests](https://github.com/MaanavKrishna/dueproof/actions/workflows/ci.yml/badge.svg)](https://github.com/MaanavKrishna/dueproof/actions/workflows/ci.yml)
[![licence: PolyForm Shield 1.0.0](https://img.shields.io/badge/licence-PolyForm_Shield_1.0.0-1F3A8A)](LICENSE)
[![languages: 23](https://img.shields.io/badge/languages-English%20%2B%2022%20Indian-6b4cf6)](docs/languages.md)

[Website](https://dueproof.vercel.app) ·
[Install](docs/install.md) ·
[Documentation](docs/index.md) ·
[Changelog](CHANGELOG.md) ·
[Roadmap](ROADMAP.md)

</div>

![A GST notice open in Dueproof: the case page with its reference, issuing office, amount demanded and the reply deadline, and the page beside it with the sentence outlined](planning/design/app-case.png)

## What it is

A notice arrives by email, through a tax portal, or as a phone photo of a
posted letter. Somewhere in it is a sentence that says what you must do, and a
date, often *"within 30 days of receipt"*, counted from a day nobody wrote
down. Dueproof reads the notice, opens a case for it, and puts each duty in
the deadline register, with the sentence outlined on the page.

- **Finds what you owe, and by when.** Duties, deadlines, hearings, amounts
  demanded, references, the issuing office and the sections cited.
- **Dates are computed, never guessed.** A rule ("30 days from receipt")
  becomes a date in one date engine, with the holiday calendar and its working
  shown. No model output is ever a date.
- **The page is the proof.** Each finding is outlined on its page and graded
  *exact*, *strong* or *approximate*. A finding that can't be located is
  marked *unlocated* and waits for a person.
- **Runs the work.** Cases with stages, threads and approval; a review queue;
  deadlines by week, in a calendar and as an iCal feed; clients with their
  registrations and statutory calendar; demand, interest and penalty
  estimates; reports, including an evidence report with page crops.
- **AI is optional.** Rules read every notice. With your own key or a local
  model, AI helps where the rules aren't confident, and its findings pass the
  same proof gate.
- **Reads Indian languages and phone photos.** All 22 scheduled languages,
  translated offline; scans go through an OCR ladder.

## Editions

| | |
|---|---|
| **Self-hosted Free** | Everything that reads, proves and tracks notices, on your own server with Docker Compose. No telemetry, no phone-home. |
| **Self-hosted Business** | Free plus SAML single sign-on, signed audit export and white-label reports, unlocked by an offline licence key ([`ee/`](ee/)). |
| **Hosted** | Run by us on Vercel, Neon and Cloudflare R2; app and database in Singapore, data stored outside India ([Deployment](docs/deployment.md)). |
| **Desktop** | Windows, macOS and Linux app that connects to your server, with OS notifications and a tray ([Desktop app](docs/desktop.md)). |
| **Phone** | The web app installs as a PWA, with camera capture and Web Push. |

## Quick start with Docker

On a Linux server with Docker Engine 24+ and the Compose plugin:

```bash
git clone https://github.com/MaanavKrishna/dueproof && cd dueproof/infra/docker
cp .env.example .env
for k in AUTH_SECRET ENGINE_SHARED_SECRET POSTGRES_PASSWORD; do
  sed -i "s|^$k=.*|$k=$(openssl rand -hex 32)|" .env
done
# set DUEPROOF_DOMAIN in .env to your domain, or localhost for a trial
docker compose up -d --build
```

Open `https://<your domain>` and sign up: the first account owns the
organisation, and after that sign-up is by invitation. The full guide, with
offline translation, backups and upgrades, is [Install](docs/install.md).

## Development

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

Read [AGENTS.md](AGENTS.md) before changing anything: it holds the house
rules (frozen contracts, computed dates, the proof gate, org-scoped queries).

## Repository layout

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
planning/           the v0.1 plan and design screenshots
```

## Documentation

| Start | Use | Run | Reference |
|---|---|---|---|
| [Overview](docs/index.md) | [Notices](docs/notices.md) | [Deployment](docs/deployment.md) | [API](docs/api.md) |
| [Install](docs/install.md) | [Workflow and reminders](docs/workflow-and-reminders.md) | [Desktop app](docs/desktop.md) | [Architecture](docs/architecture.md) |
| [Quickstart](docs/quickstart.md) | [Languages](docs/languages.md) | [Backup and restore](docs/backup-and-restore.md) | [Evaluation](docs/evaluation.md) |
| | [Profiles](docs/profiles.md) | [Upgrading](docs/upgrading.md) | [FAQ](docs/faq.md) |
| | | [Accounts and SSO](docs/accounts-and-sso.md) · [Configuration](docs/configuration.md) · [Security](docs/security.md) | |

## Status

v0.1 is in beta: hosted at <https://dueproof-app.vercel.app>, or self-hosted
with Docker. See the [changelog](CHANGELOG.md) and the [roadmap](ROADMAP.md). Statutory periods and interest rates are data with
a source, and each is marked "verify" until a chartered accountant signs it
off. Interest and penalty figures are estimates, not advice. Before you rely
on Dueproof for real deadlines, run it beside your current process.

## Contributing

The most useful contributions are a profile for your kind of organisation,
depth for a language you read, and a notice Dueproof gets wrong, reduced to a
few invented sentences, never a real document. Start with
[CONTRIBUTING.md](CONTRIBUTING.md).

Found a security problem? Please report it privately. See [SECURITY.md](SECURITY.md).

## Licence

[PolyForm Shield License 1.0.0](LICENSE). Dueproof is
source-available: you may use it, self-host it, change it and improve it for
free, but not sell it or offer it as a competing product or service, changed
or not.
Third-party components are listed in [NOTICE](NOTICE).

The exception is the [`ee/`](ee/) directory: the Business features (SAML
single sign-on, audit export, white-label reports and the offline licence
check) are proprietary, under a [commercial licence](ee/LICENSE), and work
only with a valid Dueproof Business licence. Nothing outside `ee/` depends on
it: delete the directory and you have Self-hosted Free, which builds and runs
on its own.
