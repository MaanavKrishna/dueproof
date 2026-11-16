#!/bin/sh
# Restore a Dueproof backup into this install (03 §14). Runs in the
# `restore` service; see docs/backup-and-restore.md for the full procedure:
#
#   docker compose stop app caddy
#   docker compose run --rm restore NAME      # NAME from `backup.sh list`
#   docker compose up -d
#
# Checks the backup first (checksums, readable dump and archive), then
# replaces the database (drop and recreate) and the files volume. The app
# migrates the restored database forward on start if this version is newer.
# Restore only into the same or a newer Dueproof version than the backup
# was made with: an older app must not run on a newer schema.
set -eu

BACKUPS=/backups
FILES=/data/files
name="${1:-}"
[ -n "$name" ] || { echo "usage: restore NAME (see: docker compose exec backup sh /scripts/backup.sh list)" >&2; exit 2; }
dir="$BACKUPS/$name"
[ -d "$dir" ] || { echo "no backup named $name in $BACKUPS" >&2; exit 1; }

log() { printf '%s [restore] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

log "checking $name"
(cd "$dir" && sha256sum -c --quiet SHA256SUMS)
pg_restore --list "$dir/db.dump" > /dev/null
[ ! -f "$dir/files.tar.gz" ] || tar -tzf "$dir/files.tar.gz" > /dev/null

app_connections=$(psql -d postgres -tAc "select count(*) from pg_stat_activity where datname = '$PGDATABASE' and pid <> pg_backend_pid()")
if [ "$app_connections" != "0" ]; then
  echo "the database still has $app_connections connection(s): stop the app first (docker compose stop app)" >&2
  exit 1
fi

log "replacing database $PGDATABASE"
psql -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists \"$PGDATABASE\"" -c "create database \"$PGDATABASE\" owner \"$PGUSER\""
pg_restore --no-owner --exit-on-error --dbname="$PGDATABASE" "$dir/db.dump"

if [ -f "$dir/files.tar.gz" ]; then
  log "replacing files"
  find "$FILES" -mindepth 1 -delete
  tar -xzf "$dir/files.tar.gz" -C "$FILES"
  chown -R 1000:1000 "$FILES"
else
  log "this is a database-only backup: files left as they are"
fi
log "restored $name; start the app with: docker compose up -d"
