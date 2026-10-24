#!/usr/bin/env bash
# Development shortcut for `dueproof serve` from a checkout.
set -euo pipefail
cd "$(dirname "$0")"
exec "${DUEPROOF_PYTHON:-.venv/bin/python}" -m dueproof serve "$@"
