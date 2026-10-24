#!/usr/bin/env bash
# Development shortcut: `dueproof serve` from a checkout, using .venv.
set -euo pipefail
cd "$(dirname "$0")/.."
exec "${DUEPROOF_PYTHON:-.venv/bin/python}" -m dueproof serve "$@"
