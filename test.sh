#!/usr/bin/env bash
# Run the test suite. Writes go to a temp directory; data/ is never touched.
#   ./test.sh                    everything
#   ./test.sh tests.test_dates   one module
set -euo pipefail
cd "$(dirname "$0")"
PY="${DUEPROOF_PYTHON:-.venv/bin/python}"
if [ $# -gt 0 ]; then exec "$PY" -m unittest -v "$@"; fi
exec "$PY" -m unittest discover -s tests -t . -v
