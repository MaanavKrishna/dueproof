"""Logging: every line carries the request, or the document, it belongs to."""
from __future__ import annotations

import contextvars
import logging
import os

rid: contextvars.ContextVar[str] = contextvars.ContextVar("rid", default="-")

class _RequestId(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.rid = rid.get()
        return True

def setup() -> None:
    root = logging.getLogger("dueproof")
    if not root.handlers:
        handler = logging.StreamHandler()
        handler.addFilter(_RequestId())
        handler.setFormatter(logging.Formatter(
            "%(asctime)s %(levelname)s %(name)s [%(rid)s] %(message)s"))
        root.addHandler(handler)
        root.setLevel(os.environ.get("DUEPROOF_LOG_LEVEL", "INFO").upper())
        root.propagate = False

setup()
