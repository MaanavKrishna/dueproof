# Backup and restore (self-hosted)

## What is backed up

Every night at `BACKUP_AT` (default 02:30, in `TZ`, default Asia/Kolkata) the
`backup` container writes a folder to `BACKUP_DIR` (default
`infra/docker/backups/`):

| File | Holds |
|---|---|
| `db.dump` | The whole database (`pg_dump`, custom format): your data, the workflow queue, the audit trail |
| `files.tar.gz` | Every original and page image |
| `SHA256SUMS` | Checksums of both |
| `manifest.json` | When, the Postgres version, sizes |

Each backup is **verified** straight after it is written (checksums, the dump
and the archive are readable). `backups/last.json` records the last run and
whether it verified. Backups older than `BACKUP_KEEP_DAYS` (default 14) are
deleted.

Before every `docker compose up`, `pre-upgrade-backup` also dumps the
database (not the files, which are never overwritten) if there is anything to
dump, so an upgrade can always be undone.

**Not backed up: your `.env`.** Keep a copy elsewhere. Without
`AUTH_SECRET`, sign-in to a restored copy fails.

**Copying backups off the server is your job.** A backup on the same disk
doesn't survive the disk. Sync `BACKUP_DIR` to another machine or bucket
(rsync, rclone, restic, your NAS).

## Commands

Run these from `infra/docker`:

```bash
docker compose exec backup sh /scripts/backup.sh now        # back up now
docker compose exec backup sh /scripts/backup.sh list       # list backups
docker compose exec backup sh /scripts/backup.sh verify     # verify the newest (or name one)
```

## Restore

Restore into the **same or a newer** Dueproof version than the backup was
made with. The app migrates the database forward when it starts; an older app
must never run on a newer database.

```bash
cd infra/docker
docker compose stop app caddy
docker compose run --rm restore 2026-11-16T023000-full     # a name from `list`
docker compose up -d
```

`restore` checks the backup first, then **replaces** the database and the
files volume. It refuses to run while the app is still connected.

To restore on a **new server**: install as in [Install](install.md) with your
saved `.env`, copy the backup folder into `BACKUP_DIR`, start once
(`docker compose up -d`), then run the restore as above.

A database-only backup (`…-pre-upgrade`) restores the database and leaves the
files as they are, which is what you want when undoing an upgrade.

## Tested

A backup → delete → restore round trip is part of the release checks, and was
run on the v0.1 stack: restoring brought back every document and finding in
under 2 seconds for a small install.
