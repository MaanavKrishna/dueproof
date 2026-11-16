# Architecture

Dueproof v0.1 is a TypeScript monorepo with one Python service. The full
design is in [`planning/v0.1/03-architecture.md`](../planning/v0.1/03-architecture.md);
this page is the short version.

```
browser / desktop app / phone (PWA)
        │
        ▼
apps/app (Next.js) ── Postgres (data, workflow queue, rate limits)
   │  server actions, /api/v1, Better Auth
   │  Workflow DevKit: processDocument
   │        │ signed, short-lived token
   │        ▼
   │  services/engine (Python, stateless)
   │        │ signed links, ≤ 5 minutes
   ▼        ▼
file storage (local disk or S3/R2): originals and page images
```

## Where things are

```
apps/app            The product: Next.js App Router, server actions, /api routes
  app/              Routes: (auth) sign-in and sign-up, (setup) the wizard, (app) the screens
  features/         One folder per screen: inbox, cases, deadlines, clients, reports, …
  workflows/        processDocument, the durable pipeline
  lib/              Policy checks, pipeline stages, uploads, notifications, mail, env
apps/site           The website and these docs (it reads docs/*.md at build time)
apps/desktop        Tauri 2 desktop shell
services/engine     Python engine: read, OCR, translate, rules, proof
packages/contracts  Zod schemas: the domain words, DateRule, the engine's API
packages/db         Drizzle schema, migrations, row-level security
packages/core       Pure functions: date engine, statutory calendar, interest, reconciliation, policy
packages/ai         AI providers, model choice, prompts, the proof gate
packages/auth       Better Auth setup
packages/storage    Local disk, S3 (R2, MinIO); Vercel Blob is a stub
packages/engine-client  Typed client for the engine
packages/ui, tokens, icons, i18n   The design system and English messages
ee/                 Business features under a commercial licence: SAML SSO, audit export, white-label
infra/docker        Self-hosted: Compose, Caddy, backups
infra/vercel        Hosted setup
infra/sandbox       The engine-heavy snapshot for Vercel Sandbox
```

## A document's journey

1. The browser asks `/api/v1/uploads` for a signed link, puts the file
   straight into storage, and calls `complete`. The app checks the stored
   file and starts `processDocument`.
2. The workflow calls the engine: inspect, read, (translate), analyse,
   link. The engine fetches the file through a signed link and writes page
   images back the same way. It never sees the database.
3. If AI is on, it reads only what the rules weren't confident about.
   `packages/core` reconciles rule and AI findings and turns each date rule
   into a date.
4. Findings, proof rectangles and deadlines are written in one transaction
   inside the organisation. The Inbox follows along through server-sent
   events.

## Decisions worth knowing

**Dates are computed, never generated.** The engine and AI return date
*rules* ("30 days from receipt"). Only `packages/core` turns a rule into a
date, with the organisation's holidays and working days. No model output is
ever a date.

**The page is the proof.** A finding whose quote can't be located on its
page is *not located* and can't become a deadline until a person confirms
it. Below the matching threshold there is no box at all.

**Rules first.** The rules read every notice, with or without AI. AI is off
by default and only adds findings, which are graded against the page like
any other.

**Nothing overwritten.** Corrections sit beside what was found, with a
reason. The audit trail is chained, so an edit or deletion shows.

**One organisation per query.** Every server action and route starts with a
policy check, and every query runs in a transaction scoped to one
organisation, with Postgres row-level security underneath.

**The engine is boxed in.** Stateless, no database, no storage keys,
short-lived tokens, allowed hosts only, and no network route out on a
self-hosted server.

**Statutory periods are data.** Every period and rate has a source and is
marked "verify" until a CA signs it off.

**Free core.** Everything that decides whether a finding is correct or
provable is outside `ee/` and works without a licence.

## Three ways to run

| | Self-hosted | Hosted | Desktop |
|---|---|---|---|
| App | Docker (Node 24) | Vercel Functions: app in Singapore, engine-fast in Mumbai | Connects to a server in v0.1 |
| Database | Postgres 17 with pgvector | Neon | (the server's) |
| Workflow | Postgres World | Vercel World | |
| Engine | One container with everything | engine-fast (Function) + engine-heavy (Sandbox) | |
| Files | Local disk | Cloudflare R2 | |

See [Install](install.md), [Deployment](deployment.md) and
[Desktop app](desktop.md).
