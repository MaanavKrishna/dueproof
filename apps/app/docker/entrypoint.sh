#!/bin/sh
# Entrypoint of the app image (apps/app/Dockerfile).
#
# 1. Bootstrap the Workflow Postgres World's schema (advisory-locked,
#    idempotent) when that World is selected.
# 2. Start the server. The app's own migrations run inside it at boot
#    (instrumentation.ts), also under an advisory lock.
set -eu

if [ "${WORKFLOW_TARGET_WORLD:-}" = "@workflow/world-postgres" ] && [ "${WORKFLOW_BOOTSTRAP:-1}" = "1" ]; then
  node /opt/workflow-world/bootstrap.mjs
fi

exec "$@"
