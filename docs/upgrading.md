# Upgrading (self-hosted)

Any v0.1 or later version can upgrade straight to any later one, unless the
release notes say otherwise. Release notes name every manual step.

## Steps

```bash
cd dueproof
git fetch --tags && git checkout v0.1.1        # the version you want
cd infra/docker
sed -i 's/^DUEPROOF_VERSION=.*/DUEPROOF_VERSION=0.1.1/' .env
docker compose up -d --build
```

When published images are available, set `DUEPROOF_APP_IMAGE` and
`DUEPROOF_ENGINE_IMAGE` to them in `.env` and use
`docker compose pull && docker compose up -d` instead of `--build`.

What happens on `up`:

1. `pre-upgrade-backup` dumps the database into `BACKUP_DIR`.
2. The app bootstraps the workflow queue's tables, then applies database
   migrations. Both run under Postgres advisory locks, so a second app
   container waits instead of racing.
3. Documents that were being read when the old version stopped carry on from
   their last completed step (every step is safe to repeat).

Check with `docker compose ps` (all `healthy`) and
`docker compose logs app | tail`.

## Going back

Going back means **restoring the pre-upgrade backup** and running the old
version. Never run an older app on a database a newer one has migrated.

```bash
git checkout v0.1.0 && cd infra/docker
sed -i 's/^DUEPROOF_VERSION=.*/DUEPROOF_VERSION=0.1.0/' .env
docker compose build
docker compose stop app caddy
docker compose run --rm restore <the …-pre-upgrade backup>
docker compose up -d
```

## Hosted

Hosted upgrades are continuous deploys with expand → migrate → contract
migrations; see [Deployment](deployment.md).
