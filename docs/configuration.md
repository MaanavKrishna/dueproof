# Configuration

Dueproof v0.1 is configured with environment variables. The app checks them
all when it starts (`apps/app/lib/env.ts`) and stops with a list of every
variable that is missing or wrong. The list names variables, never their
values.

Where to set them:

| Running it | File |
|---|---|
| Self-hosted (Docker Compose) | `infra/docker/.env`, from `infra/docker/.env.example`. `compose.yaml` passes a fixed set to each container and sets the rest itself (see [below](#self-hosted-docker-compose)) |
| Hosted (Vercel) | Each Vercel project's environment variables: see [`infra/vercel/README.md`](../infra/vercel/README.md) |
| Development | `apps/app/.env.local`, from `apps/app/.env.example` |

Most settings people change day to day (organisation name, time zone,
holidays, notice types, AI mode, escalation days, team) live in the app,
under **Settings**, not here.

A "secret" below is at least 32 random characters: `openssl rand -hex 32`.
Never commit one, and keep a copy of `AUTH_SECRET` away from the server.

## The app

### Basics

| Variable | Default | What it does |
|---|---|---|
| `DUEPROOF_EDITION` | `self-hosted` | `self-hosted`, `hosted` or `desktop`. Sets the defaults below, which AI modes are offered, and HSTS preload (hosted) |
| `APP_URL` | `http://localhost:3000` | The address people use to reach Dueproof. Used for links in emails, cookies (Secure when it starts with `https://`) and passkeys |
| `NODE_ENV` | `development` | `production` in the images |
| `DUEPROOF_VERSION` | `0.1.0-dev` | Reported by `/api/health` and `/api/metrics`; set by the image build |
| `DUEPROOF_DEV_PAGES` | on outside production | Bare test pages under `/dev`. Keep `0` on a real server |

### Sign-in

| Variable | Default | What it does |
|---|---|---|
| `AUTH_SECRET` | **required** | Secret. Signs sessions and tokens. Also the default seed for `STORAGE_SIGNING_SECRET` and the Web Push keys |
| `AUTH_SIGNUP` | `first-user` (`open` when hosted) | `first-user`: the first sign-up owns the organisation, then invitations only. `open`: anyone. See [Accounts](accounts-and-sso.md) |
| `AUTH_TRUSTED_ORIGINS` | | Extra origins allowed to sign in, comma separated (for example the desktop app's) |
| `AUTH_IP_HEADER` | | The header your proxy sets with the client's address: `x-forwarded-for` behind Caddy, `x-real-ip` on Vercel. Used for rate limits |

### Database

| Variable | Default | What it does |
|---|---|---|
| `DATABASE_DRIVER` | `postgres` if `DATABASE_URL` is set, else `pglite` | `postgres`, `neon` (hosted) or `pglite` (an embedded database for development and the desktop app) |
| `DATABASE_URL` | | Required for `postgres` and `neon` |
| `PGLITE_DATA_DIR` | `~/.dueproof/dev/pglite` | Where `pglite` keeps its data |
| `DB_MIGRATE_ON_START` | `1` | Apply database migrations when the app starts |

### Files

| Variable | Default | What it does |
|---|---|---|
| `STORAGE_DRIVER` | `local` | `local` (a folder on the server) or `s3` (Cloudflare R2, MinIO, any S3 API). `vercel-blob` is accepted but **not implemented in v0.1**: every file operation fails |
| `STORAGE_LOCAL_DIR` | `~/.dueproof/dev/files` | The folder for `local` |
| `STORAGE_SIGNING_SECRET` | derived from `AUTH_SECRET` | Secret for the app's own signed file links (`local`) |
| `STORAGE_ENGINE_BASE_URL` | | How the engine reaches the app's signed links when it can't use `APP_URL` (`http://app:3000` in Compose) |
| `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | | Required for `s3` |
| `S3_ENDPOINT` | | For R2: `https://<account-id>.r2.cloudflarestorage.com` |
| `S3_REGION` | `auto` | |
| `S3_FORCE_PATH_STYLE` | `0` | `1` for MinIO and similar |
| `BLOB_READ_WRITE_TOKEN` | | Asked for by `vercel-blob`, which v0.1 doesn't implement |
| `UPLOAD_MAX_BYTES` | `52428800` (50 MB) | Largest file a person can upload |

Files never pass through the app. Browsers and the engine use signed links
that expire within 5 minutes.

### The engine

| Variable | Default | What it does |
|---|---|---|
| `ENGINE_MODE` | `http` if `ENGINE_URL` is set, else `fake` | `fake` replays recorded answers, for development and tests only. The app refuses to start with it in production (except the desktop edition) |
| `ENGINE_URL` | | Where the engine is (`http://engine:8000` in Compose) |
| `ENGINE_SHARED_SECRET` | | Secret, required for `http`. The same value goes to the engine. Every call carries a token signed with it that expires within 5 minutes |
| `ENGINE_MAX_RUNG` | `tesseract` | The highest OCR step the engine may use: `text_layer`, `paddleocr`, `tesseract`. Hosted uses `paddleocr`; harder pages then go to engine-heavy |

Hosted only, for engine-heavy in Vercel Sandbox (see
[Deployment](deployment.md)):

| Variable | Default | What it does |
|---|---|---|
| `HEAVY_ENGINE_SNAPSHOT_ID` | | The Sandbox snapshot. Unset: no engine-heavy, so no Tesseract and no offline translation. Needs `STORAGE_DRIVER=s3` |
| `HEAVY_ENGINE_REGION` | `bom1` | |
| `HEAVY_ENGINE_VCPUS` | `4` | 1 to 32 |
| `HEAVY_ENGINE_TIMEOUT_MS` | `900000` (15 min) | Longest a Sandbox may run for one batch |
| `HEAVY_ENGINE_ALLOWED_HOSTS` | the storage host | Hosts the Sandbox may reach, comma separated |

### The background workflow

Each upload is read by a durable workflow (Workflow DevKit). These are read
by Workflow DevKit itself, not checked by the app:

| Variable | What it does |
|---|---|
| `WORKFLOW_TARGET_WORLD` | Where workflow state lives. `@workflow/world-postgres` on a self-hosted server (set by Compose). Unset on Vercel (the Vercel World) and in development (the Local World) |
| `WORKFLOW_POSTGRES_URL` | The database for the Postgres World |
| `WORKFLOW_POSTGRES_JOB_PREFIX`, `WORKFLOW_POSTGRES_WORKER_CONCURRENCY`, `WORKFLOW_POSTGRES_JOB_LOCK_STALE_SECONDS` | Set by Compose. Concurrency comes from `WORKFLOW_CONCURRENCY` in `.env` (default 8) |

### AI

AI is off for every organisation until an owner or admin turns it on in
**Settings → AI**. The modes are **Off** (rules only), **Local model**
(Ollama, vLLM, LM Studio; self-hosted and desktop), **Your own key**
(Anthropic, OpenAI, Azure OpenAI, OpenRouter or another OpenAI-compatible
provider) and **Dueproof AI plan** (Claude; hosted only).

| Variable | Default | What it does |
|---|---|---|
| `AI_KEY_MASTER` | | 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts each organisation's own key. Unset: **Your own key** can't save a key. Keep it out of database backups |
| `ANTHROPIC_API_KEY` | | Hosted only: the key the Dueproof AI plan uses to call the Claude API |
| `AI_GATEWAY_API_KEY` | | Hosted only, optional: the plan through Vercel AI Gateway instead, used when `ANTHROPIC_API_KEY` is unset |

On the self-hosted Compose setup, put `AI_KEY_MASTER` in `.env`. Without it
only **Off** and **Local model** work.

### Reminders and email

| Variable | Default | What it does |
|---|---|---|
| `CRON_SECRET` | | Secret. Turns on `GET /api/cron/daily` (the morning digest, notifications and escalation), which must be called with `Authorization: Bearer <CRON_SECRET>`. Unset: the route answers 404 |
| `MAIL_DRIVER` | `resend` if `RESEND_API_KEY` is set, else `smtp` if `SMTP_URL` is set, else `log` | Sends invitations, password reset links and the morning digest. `log` sends nothing: invitation links must be copied by hand, password reset links can't be sent, and digests aren't marked sent |
| `SMTP_URL` | | `smtp://user:password@host:587` |
| `RESEND_API_KEY` | | For `resend` (hosted) |
| `MAIL_FROM` | `Dueproof <no-reply@dueproof.local>` | The sender |
| `PUSH_ENABLED` | `1` | `0` turns Web Push off for the whole install |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | derived from `AUTH_SECRET` | This install's Web Push key pair (base64url, P-256) |
| `VAPID_SUBJECT` | | A contact for push services: `mailto:admin@example.com` or the app's address |

See [Workflow and reminders](workflow-and-reminders.md).

### Limits, monitoring and reports

| Variable | Default | What it does |
|---|---|---|
| `RATE_LIMIT_ENABLED` | `1` | Rate limits, counted in Postgres so they hold across instances |
| `RATE_LIMITS` | | Overrides, for example `upload.user=100/1h,search.user=60/1m` |
| `METRICS_TOKEN` | | Secret. Lets another machine read `/api/metrics` with `Authorization: Bearer <token>`. Unset: local requests only |
| `BACKUP_STATUS_FILE` | | Self-hosted: the backup container's `last.json`, mounted read-only, so **Settings → System** can show the last backup |
| `REPORT_WHITE_LABEL` | `0` | Reports without "Prepared with Dueproof". For development; the Business licence's white-label feature normally does this |
| `DUEPROOF_EE` | | Build time: `off` builds the free edition even when `ee/` is present |

Rate limits that can be overridden, and their defaults: `auth.ip` 20 per
15 minutes, `auth.account` 5 per 15 minutes, `signup.ip` 3 per hour (20 on
self-hosted and desktop), `upload.ip` 300, `upload.user` 200 and
`upload.org` 500 per hour, `search.user` 30 per minute, `export.user` 10 per
hour, `ai.org` 60 per minute, `api.token` 600 per minute.

## The engine (`services/engine`)

The engine needs very little. Compose sets these for you.

| Variable | Default | What it does |
|---|---|---|
| `ENGINE_SHARED_SECRET` | **required** | The same secret as the app's |
| `DUEPROOF_ALLOWED_HOSTS` | | Hosts the engine may fetch from and upload to (globs allowed). Compose: `app`. Hosted: `*.r2.cloudflarestorage.com` |
| `DUEPROOF_LANGUAGES` | `all` in the image (`hi` otherwise) | Which language claims a script that several share, for example `mr,ta`. See [Languages](languages.md) |
| `DUEPROOF_PROFILE` | `notices_in` | The engine's default rule set. The app asks for `notices_in` on every notice in v0.1 |
| `DUEPROOF_MODELS` | `models` (`/models` in the image) | The folder the model paths below default into |
| `DUEPROOF_TRANSLATE` | `1` | `0` turns offline translation off |
| `DUEPROOF_MT_DIR` | `<models>/indictrans2` | The IndicTrans2 weights |
| `DUEPROOF_OCR_CONFIDENCE_BAR` | `0.85` | Pages read below this go to the next OCR step, or to review |
| `DUEPROOF_PADDLE_MODELS` | `<models>/ppocr` | The PaddleOCR models |
| `DUEPROOF_TESSERACT` | found on `PATH` | The Tesseract program |
| `DUEPROOF_MAX_SOURCE_BYTES` | 80 MB | Largest file the engine opens |
| `DUEPROOF_MAX_PAGES` | `300` | A longer PDF is refused, not half read |
| `DUEPROOF_MAX_PAGE_PIXELS` | 40 megapixels | Larger pages are rendered at a lower resolution |
| `DUEPROOF_MAX_IMAGE_PIXELS` | 120 megapixels | Larger images are refused before they are decoded |
| `DUEPROOF_FETCH_TIMEOUT`, `DUEPROOF_PUT_TIMEOUT` | 30 seconds | |
| `DUEPROOF_MAX_BODY_BYTES` | 20 MB | Largest request |
| `ENGINE_TOKEN_MAX_LIFETIME` | 15 minutes | Longest-lived token the engine accepts |

## Self-hosted (Docker Compose)

`infra/docker/.env` holds only these. Compose sets the rest (database, file
storage, engine address, the Postgres World) itself.

| Variable | Default | What it does |
|---|---|---|
| `DUEPROOF_DOMAIN` | **required** | The name people type to reach Dueproof. `APP_URL` becomes `https://<domain>` |
| `AUTH_SECRET`, `ENGINE_SHARED_SECRET`, `POSTGRES_PASSWORD`, `CRON_SECRET` | **required** | Secrets. `CRON_SECRET` authorises the daily run, which the `daily` service calls |
| `DAILY_AT` | `07:00` | When the `daily` service runs the morning digest, notifications and escalation, in `TZ` |
| `SMTP_URL`, `MAIL_FROM`, `MAIL_DRIVER`, `RESEND_API_KEY` | | Email, as above |
| `AI_KEY_MASTER` | | As above |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | derived from `AUTH_SECRET` | As above |
| `AUTH_SIGNUP` | `first-user` | |
| `DUEPROOF_VERSION` | `0.1.0` | Image tag |
| `DUEPROOF_APP_IMAGE`, `DUEPROOF_ENGINE_IMAGE` | `dueproof/app`, `dueproof/engine` | Image names |
| `ENGINE_INSTALL_TRANSLATION`, `ENGINE_INSTALL_TESSERACT` | `1` | Build time: `0` leaves translation, or Tesseract too, out of the engine image. See [Install](install.md#smaller-engine-images) |
| `ENGINE_OCR_PACKS` | Hindi, Malayalam, Tamil | Build time: Tesseract language packs |
| `INDICTRANS2_DIR` | `./indictrans2` | The translation weights, mounted read-only |
| `ENGINE_MEMORY` | `6g` | The engine's memory limit |
| `ENGINE_MAX_RUNG` | `tesseract` | |
| `UPLOAD_MAX_BYTES` | 50 MB | |
| `RATE_LIMITS`, `METRICS_TOKEN` | | As above |
| `WORKFLOW_CONCURRENCY` | `8` | Workflow steps run at once |
| `BACKUP_DIR`, `BACKUP_AT`, `BACKUP_KEEP_DAYS`, `TZ` | `./backups`, `02:30`, `14`, `Asia/Kolkata` | See [Backup and restore](backup-and-restore.md). The app reads `BACKUP_DIR` read-only (`BACKUP_STATUS_FILE` is set for you) to show the last backup in **Settings → System** |
| `HTTP_PORT`, `HTTPS_PORT` | `80`, `443` | The ports Caddy listens on |
| `DUEPROOF_DEV_PAGES` | `0` | |

`compose.yaml` passes each of these from `.env` to the app. Web Push works
without the `VAPID_*` keys, with a pair derived from `AUTH_SECRET`.
