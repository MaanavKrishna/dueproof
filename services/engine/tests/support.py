"""Shared fixtures: the corpus run through the pipeline once, an engine client
and a stand-in for signed-URL storage."""
from __future__ import annotations

import functools
import json
import os
from pathlib import Path

from tests.fixtures import CIRCULAR, CORPUS, INVOICE, MINUTES, SCAN, corpus

__all__ = ["CIRCULAR", "INVOICE", "MINUTES", "SCAN"]

REPO = Path(__file__).resolve().parent.parent
PKG = REPO / "dueproof_engine"
GOLDEN = Path(__file__).parent / "golden.json"


def tesseract_present() -> bool:
    from dueproof_engine.ocr import tesseract
    return tesseract.available()


def paddle_present() -> bool:
    from dueproof_engine.ocr import paddle
    return paddle.engine() is not None


@functools.cache
def snapshot() -> dict:
    """read -> analyze -> link over every fixture PDF, minus translation (the
    model is optional and is not what these tests are pinning). The golden
    file was recorded with Tesseract as the scan's OCR, so the ladder here
    stops at Tesseract and skips PaddleOCR: tests/test_paddle.py covers that."""
    from dueproof_engine.pipeline.analyze import analyze
    from dueproof_engine.pipeline.link import build_index, link_quote
    from dueproof_engine.pipeline.read import read_pdf
    from unittest import mock
    from dueproof_engine.ocr import paddle

    out = {}
    with mock.patch.object(paddle, "engine", return_value=None):
        for path in sorted(corpus() / name for name in CORPUS):
            doc = read_pdf(path)
            found = analyze(doc["page_texts"], path.name)
            by_page: dict[int, list[dict]] = {}
            for w in doc["words"]:
                by_page.setdefault(w["page_num"], []).append(w)
            index = build_index(by_page)
            findings = []
            for kind, items in (("bullet", found["summary"]), ("obligation", found["obligations"])):
                for f in items:
                    hit = link_quote(f["evidence_quote"], index, f["page"])
                    findings.append({
                        "kind": kind, "quote": f["evidence_quote"], "lang": f["orig_lang"],
                        "due_date": f.get("due_date"), "severity": f.get("severity"),
                        "roles": f["roles"], "page": hit["page_num"], "score": hit["score"],
                        "confidence": hit["confidence"], "lines": len(hit["rects"])})
            out[path.name] = {
                "title": found["title"], "doc_type": found["doc_type"],
                "doc_date": found["doc_date"], "languages": doc["languages"],
                "page_count": doc["page_count"], "text_source": doc["text_source"],
                "full_text": doc["full_text"], "findings": findings}
    return out


def golden() -> dict:
    return json.loads(GOLDEN.read_text(encoding="utf-8"))


def token(ttl: int = 300) -> str:
    from dueproof_engine.api.auth import make_token
    return make_token(os.environ["ENGINE_SHARED_SECRET"], ttl)


@functools.cache
def client():
    """The engine app, in-process, with a valid bearer token."""
    from fastapi.testclient import TestClient
    from dueproof_engine.app import app
    return TestClient(app, headers={"Authorization": f"Bearer {token(600)}"})


def make_pdf(marker: str, pages: int = 1) -> bytes:
    """A small native-text PDF, unique per marker, with one dated obligation."""
    from tests.pdfgen import pdf
    return pdf([
        f"Subject: Test circular {marker} page {n + 1}\n\n"
        f"The Station Controller shall submit the fire safety audit report {marker} "
        "to the Safety Officer on or before 21 August 2026.\n\n"
        "This circular is issued to all elevated stations and applies to every "
        "platform, concourse and passenger area without exception during the audit."
        for n in range(pages)])
