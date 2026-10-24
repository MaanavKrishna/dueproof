"""The test corpus: committed PDFs in tests/fixtures/, all fictional.

Regenerate them with tests/make_fixtures.py (see its docstring).
"""
from __future__ import annotations

from pathlib import Path

FOLDER = Path(__file__).resolve().parent / "fixtures"
CIRCULAR = "circular-NMR-SAF-2026-041.pdf"     # bilingual, text layer
SCAN = "Scan-circular-photo.pdf"               # the same circular, photographed: OCR path
INVOICE = "invoice-HVC-2026-1183.pdf"
MINUTES = "minutes-board-87.pdf"
NOTICE = "notice-gst-asmt10.pdf"               # a tax notice: reference, demand, hearing
CORPUS = (CIRCULAR, SCAN, INVOICE, MINUTES, NOTICE)
LOCKED = "edge-password-protected.pdf"         # edge cases, not part of the corpus
POSTER = "edge-poster-page.pdf"

def corpus() -> Path:
    return FOLDER
