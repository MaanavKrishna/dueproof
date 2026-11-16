# Install (self-hosted server)

Dueproof v0.1 runs on your own server as four containers, started with Docker
Compose:

| Container | What it does |
|---|---|
| `app` | The web app, the API and the background workflow that reads each notice (Next.js, Node 24) |
| `engine` | Reads PDFs and scans, OCR, offline translation, rules and proof (Python). It is the only part that opens uploaded files, and it has **no network route out** |
| `postgres` | PostgreSQL 17 with pgvector: all your data, the workflow queue and the rate-limit counters |
| `caddy` | HTTPS in front of the app, with a certificate it gets and renews by itself |

Three small helpers run beside them: `backup` (a nightly backup, see
[Backup and restore](backup-and-restore.md)), `pre-upgrade-backup` (a
database dump before each start that could migrate the database) and
`daily` (the morning digest, notifications and escalation, see
[Workflow and reminders](workflow-and-reminders.md#the-daily-run)).

Nothing is sent to us: no telemetry, no usage data, no update check.

> Hosted on Vercel instead? See [Deployment](deployment.md).

## What you need

- A Linux server with Docker Engine 24+ and the Compose plugin
  (`docker compose version`).
- **4 vCPU, 8 GB RAM, 40 GB disk.** 16 GB RAM if you turn on offline
  translation (to be confirmed by the M0 measurements).
- A domain name pointing at the server, with ports **80 and 443** open, so
  Caddy can get a certificate. For a trial on one machine, `localhost` works.

## 1. Get the files

```bash
git clone https://github.com/MaanavKrishna/dueproof && cd dueproof/infra/docker
cp .env.example .env
```

## 2. Fill in `.env`

```bash
# four secrets, 32+ characters each
for k in AUTH_SECRET ENGINE_SHARED_SECRET POSTGRES_PASSWORD CRON_SECRET; do
  sed -i "s|^$k=.*|$k=$(openssl rand -hex 32)|" .env
done
```

Then set `DUEPROOF_DOMAIN` to your domain (for example `dueproof.yourfirm.in`).

**Keep a copy of `.env` somewhere safe, away from the server.** Backups don't
include it, and without `AUTH_SECRET` nobody can sign in to a restored copy.

To send email (invitations, password reset links, the morning digest), set
`SMTP_URL` and `MAIL_FROM`. Without them nothing is emailed: you copy
invitation links by hand, and password resets and digests can't go out.

Everything else in `.env.example` is optional and explained there: the
daily run's time, the AI key master key, Web Push keys, the engine's image
options, backup time and retention, upload size, rate limits.

## 3. Start it

```bash
docker compose up -d --build
```

The first build takes a while (the engine image installs PyTorch and Tesseract).
When `docker compose ps` shows `app` as `healthy`, open
`https://<your domain>` and **sign up: the first account owns the
organisation**. After that, sign-up is by invitation only.

To check the parts from the server:

```bash
docker compose exec app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.text()).then(console.log)"
```

This reports the database and the engine (with the OCR rungs it has). The
health and metrics endpoints are **not** reachable through Caddy.

## Offline translation (optional)

The engine image includes IndicTrans2's code but not its weights (about 1 GB;
their licence must be accepted). On a machine with internet access:

```bash
cd services/engine && uv sync --group heavy
uv run python -m dueproof_engine.tools.model     # downloads and verifies the weights
```

Copy the folder it fills to the server, set `INDICTRANS2_DIR=/path/to/it` in
`.env`, and `docker compose up -d engine`. The folder is mounted read-only.
`/api/health` then shows `"translation": true`.

## Smaller engine images

| `.env` | Engine has | Image size |
|---|---|---|
| (default) | Text layer, PaddleOCR, Tesseract (Hindi, Malayalam, Tamil packs), IndicTrans2 code | largest (CPU PyTorch) |
| `ENGINE_INSTALL_TRANSLATION=0` | Text layer, PaddleOCR, Tesseract | smaller |
| `ENGINE_INSTALL_TRANSLATION=0` and `ENGINE_INSTALL_TESSERACT=0` | Text layer and PaddleOCR only (about 530 MB) | smallest |

Add Tesseract packs with `ENGINE_OCR_PACKS="tesseract-ocr-hin tesseract-ocr-ben …"`.
Rebuild with `docker compose build engine && docker compose up -d engine`.

## How it is locked down

- `app` and `engine` run as unprivileged users with **read-only root
  filesystems**, all Linux capabilities dropped and `no-new-privileges`.
- The engine sits only on an internal Docker network with no route to the
  internet, and accepts calls only with a short-lived token signed with
  `ENGINE_SHARED_SECRET`. It fetches files only from the app, through signed
  URLs that expire within 5 minutes.
- Postgres is not published on any port.
- Caddy refuses `/api/health`, `/api/metrics` and the workflow queue's
  internal route from outside.
- The app sends a strict Content Security Policy, HSTS and the other security
  headers on every response, and rate-limits sign-in, sign-up and uploads.

## Monitoring

- Logs: `docker compose logs -f app engine` (JSON lines, never document text).
- Metrics: `GET /api/metrics` in Prometheus format, from the server itself, or
  from another machine with `Authorization: Bearer <METRICS_TOKEN>` if you set
  one (you then need to publish the app port or add a Caddy route for it).
- Backups: `infra/docker/backups/last.json` says when the last one ran and
  whether it verified.

## Next

- [Backup and restore](backup-and-restore.md)
- [Upgrading](upgrading.md)
- [Configuration](configuration.md)
