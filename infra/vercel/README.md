# Hosted Dueproof on Vercel

The hosted edition is three Vercel projects from this one repository, plus
Neon (Postgres) through the Vercel Marketplace and a Cloudflare R2 bucket
(03 §3). The app and its database run in **Singapore**: Neon through the
Vercel Marketplace offers Singapore (`aws-ap-southeast-1`) as its closest
region to India, and the app's functions sit next to it (`sin1`).
engine-fast stays in **Mumbai** (`bom1`).

| Vercel project | Root Directory | What it is | Config |
|---|---|---|---|
| `dueproof-app` | `apps/app` | The product: Next.js, API, Workflow DevKit (Vercel World), engine-heavy Sandboxes | `apps/app/vercel.ts` |
| `dueproof-site` | `apps/site` | Website and docs | framework defaults |
| `dueproof-engine-fast` | `services/engine` | The engine as a Python Function: text layer, PaddleOCR, rules, proof. **Holds no secrets but its own token key** | `services/engine/vercel.json` |

engine-heavy (Tesseract, IndicTrans2) is not a project: it runs in Vercel
Sandbox microVMs started by `dueproof-app` from a snapshot built by
`infra/sandbox/build-snapshot.ts`.

The hosted edition runs this way: the app at <https://dueproof-app.vercel.app>
and the website at <https://dueproof.vercel.app>. engine-heavy is off on
hosted in the v0.1 beta. Items marked **verify in M0** are not yet confirmed
on a real account.

## 0. Before you start

- A Vercel team (Hobby is fine while building; **Pro before charging
  anyone**: Hobby is for non-commercial use).
- A Cloudflare account for R2.
- The Vercel CLI (`npm i -g vercel`) and `pnpm`.
- Generate three secrets now and keep them in your password manager:

  ```bash
  openssl rand -hex 32   # AUTH_SECRET (app)
  openssl rand -hex 32   # ENGINE_SHARED_SECRET (app and engine-fast: the same value)
  openssl rand -hex 32   # CRON_SECRET (app; Vercel Cron sends it to the daily run)
  ```

- A [Resend](https://resend.com) account with your sending domain verified
  (for example `mail.dueproof.in`), and an API key with sending access only.

## 1. Cloudflare R2

1. **R2 → Create bucket** `dueproof-prod` (location hint: Asia-Pacific). R2
   cannot pin data to India. Together with the database in Singapore, this
   is the disclosed residency exception (05 §6): hosted data is stored
   outside India.
   Make a second bucket `dueproof-preview` for preview deployments.
2. **Settings → CORS policy** on each bucket, so browsers can PUT uploads and
   GET page images through signed URLs:

   ```json
   [{
     "AllowedOrigins": ["https://app.dueproof.in"],
     "AllowedMethods": ["GET", "PUT", "HEAD"],
     "AllowedHeaders": ["content-type", "content-length", "x-amz-*"],
     "ExposeHeaders": ["etag"],
     "MaxAgeSeconds": 600
   }]
   ```

   (Add the preview origin pattern on the preview bucket.)
3. **R2 → Manage API tokens → Create API token**: permission **Object Read &
   Write**, **specific buckets only** (`dueproof-prod`), no TTL or a rotation
   date you will keep. Note the Access Key ID, Secret Access Key and the
   S3 endpoint `https://<account-id>.r2.cloudflarestorage.com`.
   Make a separate token for the preview bucket.
4. Optional, for offline translation: upload the IndicTrans2 weights as a
   `.tar.gz` (from `python -m dueproof_engine.tools.model`) to a third,
   private bucket (`dueproof-models`). The snapshot build reads it once
   through a signed URL.

## 2. `dueproof-engine-fast`

1. **Add New → Project**, import the repository, **Root Directory**
   `services/engine`. Framework preset: *Other* (Vercel detects Python;
   `vercel.json` routes everything to `api/index.py` and fetches the
   PaddleOCR models at build time).
2. Environment variables (Production and Preview):

   | Name | Value |
   |---|---|
   | `ENGINE_SHARED_SECRET` | the shared engine secret |
   | `DUEPROOF_ALLOWED_HOSTS` | `*.r2.cloudflarestorage.com` (the engine fetches and PUTs only there) |

   **Nothing else**: no database URL, no storage keys, no AI key (05 §4).
3. Deploy. `GET https://<engine-fast-url>/health` should list
   `text_layer` and `paddleocr` as `true`.
4. Settings → Functions: region **Mumbai (bom1)** (also set in `vercel.json`).
5. Deployment Protection can stay on for Preview; Production must be
   reachable by the app (the app authenticates every call with a 5-minute
   token).

**Verify in M0:** the unpacked function size against the 250 MB limit
(about 213 MB measured locally) and the cold-start time with the OCR models.

## 3. `dueproof-app`

1. **Add New → Project**, same repository, **Root Directory** `apps/app`.
   `apps/app/vercel.ts` sets the framework, the pnpm install and build,
   region `sin1`, Fluid compute and the function durations (the Workflow
   routes get the plan maximum).
2. **Storage → Neon (Marketplace) → Create**: region **AWS Asia Pacific
   (Singapore) `aws-ap-southeast-1`**, the closest region to India the
   Marketplace offers. Connect it to `dueproof-app` for
   Production, Preview (a branch per preview) and Development. This adds
   `DATABASE_URL` (pooled) and related variables.
3. Environment variables:

   | Name | Production | Notes |
   |---|---|---|
   | `DUEPROOF_EDITION` | `hosted` | open sign-up, HSTS preload |
   | `APP_URL` | `https://app.dueproof.in` | the public origin |
   | `AUTH_SECRET` | secret | |
   | `AUTH_IP_HEADER` | `x-real-ip` | Vercel's client IP header |
   | `DATABASE_DRIVER` | `neon` | uses the Neon serverless driver over the pooled `DATABASE_URL` |
   | `DATABASE_URL` | from the Neon integration | pooled connection string |
   | `STORAGE_DRIVER` | `s3` | |
   | `S3_BUCKET` | `dueproof-prod` | `dueproof-preview` for Preview |
   | `S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` | |
   | `S3_REGION` | `auto` | |
   | `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | the bucket-scoped R2 token | |
   | `ENGINE_MODE` | `http` | |
   | `ENGINE_URL` | `https://<dueproof-engine-fast production URL>` | |
   | `ENGINE_SHARED_SECRET` | the shared engine secret | same as engine-fast |
   | `ENGINE_MAX_RUNG` | `paddleocr` | engine-fast stops there; harder pages go to engine-heavy |
   | `HEAVY_ENGINE_SNAPSHOT_ID` | from step 4 | unset = no engine-heavy |
   | `HEAVY_ENGINE_REGION` | `bom1` | **verify in M0** that Sandbox runs there |
   | `ANTHROPIC_API_KEY` | Claude API key | the Dueproof AI plan calls the Claude API directly with this key. Unset: the plan has no provider and AI stays off for organisations on it |
   | `AI_GATEWAY_API_KEY` | optional | an alternative plan path through Vercel AI Gateway, used only when `ANTHROPIC_API_KEY` is unset |
   | `AI_KEY_MASTER` | optional secret | 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts each organisation's own AI key ("Your own key" mode). Unset: those keys can't be saved |
   | `CRON_SECRET` | secret | Vercel Cron sends it as `Authorization: Bearer …` when it calls `/api/cron/daily` every morning (01:15 UTC, from `apps/app/vercel.ts`): the morning digest, due-soon and overdue notifications, and escalation. Unset: the route answers 404 and the daily run never happens |
   | `MAIL_DRIVER` | `resend` | picked automatically when `RESEND_API_KEY` is set. `log` sends nothing |
   | `RESEND_API_KEY` | Resend API key (sending access) | sends invitations, password reset links and the morning digest. Unset: no email at all, so invitees need a copied link and nobody can reset a password |
   | `MAIL_FROM` | `Dueproof <no-reply@mail.dueproof.in>` | the sender; its domain must be verified in Resend |
   | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | optional | this install's Web Push key pair (base64url, P-256; `npx web-push generate-vapid-keys`). Unset: a pair derived from `AUTH_SECRET`. Changing them ends every existing push subscription |
   | `VAPID_SUBJECT` | `mailto:support@dueproof.in` | a contact the push services can reach |
   | `METRICS_TOKEN` | optional secret | to scrape `/api/metrics` |
   | `DUEPROOF_DEV_PAGES` | `0` | |

   Not needed: `WORKFLOW_TARGET_WORLD` (the Vercel World is chosen
   automatically on Vercel) and `VERCEL_OIDC_TOKEN` (provided at run time;
   the Sandbox SDK uses it).
4. Deploy, then sign up at `APP_URL` and upload a notice.

## 4. engine-heavy snapshot

```bash
cd infra/sandbox
vercel link              # to dueproof-app: Sandbox usage is billed to that project
vercel env pull          # writes VERCEL_OIDC_TOKEN (valid 12 hours) to .env.local
node --env-file .env.local build-snapshot.ts --dry-run   # see the plan
INDICTRANS2_WEIGHTS_URL="<signed GET URL of the weights tarball>" \
  node --env-file .env.local build-snapshot.ts
```

It prints `snapshot snap_…`: set `HEAVY_ENGINE_SNAPSHOT_ID` on `dueproof-app`
and redeploy. Each job then starts a microVM from that snapshot with a
network policy allowing **only the R2 host**, runs one batch, and stops it.

Rebuild the snapshot when the engine's heavy dependencies or models change,
and monthly for security updates. **Verify in M0:** Sandbox availability in
bom1, snapshot lifetime, start time from the snapshot, Hobby/Pro concurrency
and duration caps (45 minutes on Hobby), and that the 5-minute signed URLs
are enough for the largest documents engine-heavy reads.

## 5. `dueproof-site`

**Add New → Project**, Root Directory `apps/site`, framework Next.js, region
`bom1`. No secrets.

## 6. Domains and the firewall

- `app.dueproof.in` → `dueproof-app`, `dueproof.in` → `dueproof-site`.
  engine-fast keeps its `*.vercel.app` URL (nobody but the app calls it).
- Vercel Firewall: rate-limit rules on `/api/auth/sign-in/*`,
  `/api/auth/sign-up/*` and `/api/v1/uploads` (the app enforces 05 §3a in
  Postgres as well), BotID on sign-up and sign-in (**verify plan support in
  M0**).
- Once the domain is final, submit it to the HSTS preload list (the app
  already sends `preload` on hosted).

## Previews

Preview deployments get a Neon branch from the integration, the preview R2
bucket and token, and engine-fast's production URL (it holds no data).
They share the production snapshot id for engine-heavy.
