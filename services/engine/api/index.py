"""Vercel Python Function entrypoint for engine-fast.

Vercel serves the ASGI `app` exported here. Everything is routed to it by
vercel.json, so the engine's own paths (/v1/read, /health, ...) are the URLs.
See services/engine/README.md, "Deploying engine-fast on Vercel".
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dueproof_engine.app import app  # noqa: E402

__all__ = ["app"]
