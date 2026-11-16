#!/bin/sh
# Dueproof backups for the self-hosted server (03 §14). Runs in the
# `backup` service (the Postgres image, so pg_dump matches the server).
#
#   backup.sh schedule        every day at BACKUP_AT (default 02:30, TZ), forever
#   backup.sh now             one backup now
#   backup.sh pre-upgrade     database only, before migrations; skipped on a fresh install
#   backup.sh verify [NAME]   check a backup (default: the newest)
#   backup.sh list            list backups
#
# A backup is a folder /backups/<NAME>/ holding:
#   db.dump        pg_dump custom format (all schemas: app, workflow queue, rate limits)
#   files.tar.gz   the originals and page images volume (not in pre-upgrade backups)
#   SHA256SUMS     checksums of the above
#   manifest.json  when, what, sizes
# /backups/last.json records the last run and whether it verified.
#
# Not included: secrets. Keep a copy of your .env (AUTH_SECRET,
# ENGINE_SHARED_SECRET, POSTGRES_PASSWORD) somewhere else. Copying
# /backups off the machine is the admin's job.
set -eu

BACKUPS=/backups
FILES=/data/files
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

log() { printf '%s [backup] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

status() { # status ok|failed NAME MESSAGE
  printf '{"status":"%s","name":"%s","at":"%s","message":"%s"}\n' \
    "$1" "$2" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$3" > "$BACKUPS/last.json.tmp"
  mv "$BACKUPS/last.json.tmp" "$BACKUPS/last.json"
}

verify() { # verify DIR
  dir="$1"
  [ -f "$dir/SHA256SUMS" ] || { log "no SHA256SUMS in $dir"; return 1; }
  (cd "$dir" && sha256sum -c --quiet SHA256SUMS) || { log "checksum mismatch in $dir"; return 1; }
  pg_restore --list "$dir/db.dump" > /dev/null || { log "db.dump unreadable in $dir"; return 1; }
  if [ -f "$dir/files.tar.gz" ]; then
    tar -tzf "$dir/files.tar.gz" > /dev/null || { log "files.tar.gz unreadable in $dir"; return 1; }
  fi
  log "verified $(basename "$dir")"
}

backup() { # backup KIND (full|pre-upgrade)
  kind="$1"
  name="$(date +%Y-%m-%dT%H%M%S)-$kind"
  dir="$BACKUPS/$name"
  tmp="$BACKUPS/.partial-$name"
  mkdir -p "$tmp"
  t0=$(date +%s)
  log "starting $kind backup $name"
  pg_dump --format=custom --compress=6 --no-owner --file="$tmp/db.dump"
  if [ "$kind" = "full" ] && [ -d "$FILES" ]; then
    tar -czf "$tmp/files.tar.gz" -C "$FILES" .
  fi
  (cd "$tmp" && sha256sum db.dump $( [ -f files.tar.gz ] && echo files.tar.gz ) > SHA256SUMS)
  db_bytes=$(stat -c %s "$tmp/db.dump")
  files_bytes=$( [ -f "$tmp/files.tar.gz" ] && stat -c %s "$tmp/files.tar.gz" || echo 0 )
  server=$(psql -tAc "show server_version" | tr -d ' ')
  printf '{"name":"%s","kind":"%s","createdAt":"%s","postgres":"%s","dbBytes":%s,"filesBytes":%s}\n' \
    "$name" "$kind" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$server" "$db_bytes" "$files_bytes" > "$tmp/manifest.json"
  mv "$tmp" "$dir"
  if verify "$dir"; then
    status ok "$name" "$kind backup verified in $(( $(date +%s) - t0 ))s"
  else
    status failed "$name" "verification failed"
    return 1
  fi
  # Retention: drop backups older than KEEP_DAYS (and stale partials).
  find "$BACKUPS" -mindepth 1 -maxdepth 1 -type d -mtime +"$KEEP_DAYS" -exec rm -rf {} +
  log "done $name (db $db_bytes bytes, files $files_bytes bytes)"
}

newest() { ls -1d "$BACKUPS"/*/ 2>/dev/null | sort | tail -n 1 | sed 's:/$::'; }

case "${1:-now}" in
  now)
    backup full ;;
  pre-upgrade)
    # Only when there is a schema to protect: a fresh install has nothing to dump.
    if [ "$(psql -tAc "select to_regclass('drizzle.__drizzle_migrations') is not null")" = "t" ]; then
      backup pre-upgrade
    else
      log "fresh database: no pre-upgrade backup needed"
    fi ;;
  verify)
    target="${2:-$(newest)}"
    [ -n "$target" ] || { log "no backups yet"; exit 1; }
    case "$target" in /*) ;; *) target="$BACKUPS/$target" ;; esac
    verify "$target" ;;
  list)
    ls -1 "$BACKUPS" | grep -v '^last.json$' | grep -v '^\.' || true ;;
  schedule)
    at="${BACKUP_AT:-02:30}"
    log "nightly backups at $at ($TZ), kept $KEEP_DAYS days"
    while :; do
      now=$(date +%s)
      next=$(date -d "today $at" +%s)
      [ "$next" -gt "$now" ] || next=$(date -d "tomorrow $at" +%s)
      sleep $(( next - now ))
      backup full || log "backup failed; will try again tomorrow"
    done ;;
  *)
    echo "usage: backup.sh schedule|now|pre-upgrade|verify [NAME]|list" >&2
    exit 2 ;;
esac
