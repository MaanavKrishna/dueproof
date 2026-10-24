"""Shared fixtures: the corpus run through the pipeline once, and an API client."""
from __future__ import annotations

import functools
import json
import time
from pathlib import Path

from tests.fixtures import CIRCULAR, CORPUS, INVOICE, MINUTES, SCAN, corpus

__all__ = ["CIRCULAR", "INVOICE", "MINUTES", "SCAN"]

REPO = Path(__file__).resolve().parent.parent
PKG = REPO / "dueproof"
GOLDEN = Path(__file__).parent / "golden.json"


@functools.cache
def snapshot() -> dict:
    """read -> analyze -> link over every fixture PDF, minus translation (the
    model is optional and is not what these tests are pinning)."""
    from dueproof.pipeline.analyze import analyze
    from dueproof.pipeline.link import build_index, link_quote
    from dueproof.pipeline.read import read_pdf

    out = {}
    for path in sorted(corpus() / name for name in CORPUS):
        doc = read_pdf(f"golden-{path.stem[:20]}", path)
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


@functools.cache
def client():
    from fastapi.testclient import TestClient
    from dueproof.web import app as webapp
    # Every state-changing call must carry the CSRF header; the app sends it.
    return TestClient(webapp.app, headers={"X-Dueproof": "1"})


def wait_done(doc_id: str, timeout: float = 180.0) -> dict:
    from dueproof import db
    end = time.time() + timeout
    while time.time() < end:
        r = db.one("SELECT status, error FROM documents WHERE id=?", (doc_id,))
        if r and r["status"] in ("done", "error"):
            return r
        time.sleep(0.05)
    raise TimeoutError(doc_id)


@functools.cache
def ingest(name: str, channel: str = "Email") -> str:
    """Put one fixture document through the real app pipeline (once per run)."""
    from dueproof import ingest as ingestion
    doc_id = ingestion.enqueue(name, corpus() / name, channel, None)["doc_id"]
    assert wait_done(doc_id)["status"] == "done", name
    return doc_id


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


def upload(data: bytes, name: str = "test.pdf", **form) -> "object":
    return client().post("/api/upload", files={"file": (name, data, "application/pdf")}, data=form)
