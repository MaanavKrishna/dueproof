"""Getting documents in: admit a file once, queue it, and run it through the
pipeline — read, translate, analyze, link — on a small pool of workers, writing
each stage to the database so progress can be shown while it runs.
"""
from __future__ import annotations

import hashlib
import json
import logging
import queue
import shutil
import threading
import time
import uuid
from datetime import date
from pathlib import Path

from dueproof import config, db
from dueproof.config import UPLOADS
from dueproof.logs import rid
from dueproof.pipeline.analyze import analyze
from dueproof.pipeline.link import CANDIDATE_KEYS, build_index, link_quote, near_duplicate_score, signature
from dueproof.pipeline.read import read_image, read_pdf
from dueproof.pipeline.translate import translate_findings, translator

log = logging.getLogger("dueproof.ingest")

ACCEPTED_SUFFIXES = (".pdf", ".jpg", ".jpeg", ".png", ".tif", ".tiff")

def sniff(head: bytes) -> str | None:
    """What a file really is, from its first bytes — the name proves nothing.
    A PDF header may sit anywhere in the first 1024 bytes, per the specification."""
    if b"%PDF-" in head[:1024]:
        return ".pdf"
    if head.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if head[:4] in (b"II*\x00", b"MM\x00*"):
        return ".tif"
    return None

def original_path(doc_id: str) -> Path | None:
    """Where a document's uploaded original is kept, whatever its type."""
    return next(iter(sorted(UPLOADS.glob(f"{doc_id}.*"))), None)

# Measured: a native PDF against a phone photo of its own printout, OCR'd,
# scores around 90; unrelated documents from one organisation stay under 55.
# Above 80 means the same document arriving through a second channel.
DUPLICATE_THRESHOLD = 80.0
# OCR saturates cores: uncapped, five documents at once starve the status endpoint.
WORKERS = 2

INSERT_FINDING = (
    "INSERT INTO findings (id,doc_id,kind,ord,text_en,text_local,due_date,severity,roles,"
    "evidence_quote,page_num,rects_json,match_score,orig_lang,translated,term_flags,"
    "section,tag,due_basis) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")

# processing
def _process(doc_id: str, src_path: Path, filename: str) -> None:
    clock, t0 = {}, time.perf_counter()
    def lap(stage: str) -> None:
        nonlocal t0
        clock[stage], t0 = round((time.perf_counter() - t0) * 1000), time.perf_counter()
    try:
        db.forget(doc_id)                   # a retried document starts clean
        db.set_stage(doc_id, "Rendering pages", 8)
        reader = read_pdf if src_path.suffix == ".pdf" else read_image
        doc = reader(doc_id, src_path, progress=lambda i, n: db.set_stage(
            doc_id, f"Reading page {i} of {n}", 8 + int(52 * i / max(n, 1))))
        by_page: dict[int, list[dict]] = {}
        for w in doc["words"]:
            by_page.setdefault(w["page_num"], []).append(w)
        db.runmany("INSERT INTO pages VALUES (?,?,?,?)", [
            (doc_id, pno, text, json.dumps(
                [[w["text"], round(w["x0"], 5), round(w["y0"], 5), round(w["x1"], 5),
                  round(w["y1"], 5), w["line_id"]] for w in by_page.get(pno, [])],
                ensure_ascii=False, separators=(",", ":")))
            for pno, text in enumerate(doc["page_texts"], 1)])
        lap("read")

        # Non-English sentences are translated first, so the rules can read
        # any enabled language; the quote that gets proved stays the original.
        db.set_stage(doc_id, "Reading for obligations" if len(doc["languages"]) == 1
                     and doc["languages"][0] == "en" else "Translating and reading", 64)
        received = db.one("SELECT received_on FROM documents WHERE id=?", (doc_id,))["received_on"]
        found = analyze(doc["page_texts"], filename, translate=translator(),
                        received=date.fromisoformat(received) if received else config.today())
        findings = ([dict(f, kind="bullet") for f in found["summary"]]
                    + [dict(f, kind="obligation") for f in found["obligations"]])
        lap("analyze")

        findings = translate_findings(findings)     # any the first pass did not reach
        lap("translate")

        db.set_stage(doc_id, "Linking sources to pages", 86)
        index = build_index(by_page)
        rows = []
        for i, f in enumerate(findings):
            hit = link_quote(f["evidence_quote"], index, f["page"])
            rows.append((f"{doc_id}-{i}", doc_id, f["kind"], i, f["text_en"], f["text_local"],
                         f.get("due_date"), f.get("severity"),
                         json.dumps(f.get("roles", []), ensure_ascii=False),
                         f["evidence_quote"], hit["page_num"], json.dumps(hit["rects"]),
                         hit["score"], f["orig_lang"], int(f["translated"]),
                         json.dumps(f.get("term_flags", []), ensure_ascii=False),
                         f.get("section"), f.get("tag"), f.get("due_basis")))
        db.runmany(INSERT_FINDING, rows)
        # Search covers every page's own text, plus the English of translated
        # findings — so an English query finds a duty written in another language.
        db.runmany("INSERT INTO search (body, doc_id, page_num, finding_id) VALUES (?,?,?,?)",
                   [(text, doc_id, pno, None) for pno, text in enumerate(doc["page_texts"], 1)]
                   + [(r[4], doc_id, r[10], r[0]) for r in rows if r[14] and r[4]])
        lap("link")

        db.set_stage(doc_id, "Cross-checking corpus", 94)
        _find_duplicates(doc_id, doc["full_text"])
        lap("duplicates")
        notice = found["notice"]
        db.run("UPDATE documents SET title=?, doc_type=?, languages=?, page_count=?,"
               " text_source=?, ocr_confidence=?, doc_date=?, reference=?, authority=?,"
               " amount=?, amount_text=?, sections=?, status='done',"
               " stage='Ready', percent=100 WHERE id=?",
               (found["title"] or filename, found["doc_type"], json.dumps(doc["languages"]),
                doc["page_count"], doc["text_source"], doc["ocr_confidence"],
                found["doc_date"], notice["reference"], notice["authority"], notice["amount"],
                notice["amount_text"], json.dumps(notice["sections"]), doc_id))
        log.info("processed %s: findings=%d source=%s pages=%d ms=%s", filename, len(rows),
                 doc["text_source"], doc["page_count"], clock)
    except Exception as exc:                # noqa: BLE001 — one bad PDF must not kill the app
        log.exception("processing failed: %s", filename)
        # The full traceback is in the log; the toast gets the message with
        # the upload path stripped, so it stays readable on a projector.
        msg = str(exc).replace(f"{UPLOADS}/", "")[:300]
        db.forget(doc_id)
        db.run("UPDATE documents SET status='error', stage='Failed', percent=100,"
               " error=? WHERE id=?", (msg, doc_id))

def _find_duplicates(doc_id: str, full_text: str) -> None:
    """The 'siloed awareness' case: the same circular arriving twice, two channels.

    Two stages: an indexed count of shared signature keys picks the candidates
    without reading anyone's text, then the fuzzy scorer — the only stage that
    loads another document, and the one that decides."""
    keys = signature(full_text)
    # Text and keys land before the lookup, and the lookup does not wait for the
    # other document to finish: of two copies processed at the same moment,
    # whichever looks second is guaranteed to see the first.
    db.run("UPDATE documents SET full_text=? WHERE id=?", (full_text, doc_id))
    db.runmany("INSERT OR IGNORE INTO dup_keys VALUES (?,?)", [(k, doc_id) for k in keys])
    if not keys:
        return
    marks = ",".join("?" * len(keys))
    for cand in db.q(f"SELECT doc_id FROM dup_keys WHERE key IN ({marks}) AND doc_id<>?"
                     " GROUP BY doc_id HAVING COUNT(*)>=?", (*keys, doc_id, CANDIDATE_KEYS)):
        other = db.one("SELECT full_text FROM documents WHERE id=?", (cand["doc_id"],))
        score = near_duplicate_score(full_text, (other or {}).get("full_text") or "")
        if score >= DUPLICATE_THRESHOLD:
            for a, b in ((doc_id, cand["doc_id"]), (cand["doc_id"], doc_id)):
                db.run("INSERT OR REPLACE INTO duplicates VALUES (?,?,?)", (a, b, score))

# A fixed pool, not a thread per upload: each worker holds one database
# connection for its whole life, so connections do not pile up with the corpus.
_JOBS: queue.Queue = queue.Queue()
_INGEST = threading.Lock()

def _worker() -> None:
    while True:
        doc_id, path, filename = _JOBS.get()
        rid.set(f"doc:{doc_id}")
        try:
            _process(doc_id, path, filename)
        except Exception:                   # noqa: BLE001 — _process reports its own failures;
            log.exception("worker survived an unreported failure")   # this keeps the pool alive
        finally:
            _JOBS.task_done()

for _n in range(WORKERS):
    threading.Thread(target=_worker, daemon=True, name=f"dueproof-worker-{_n}").start()

def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        while chunk := fh.read(1 << 20):
            digest.update(chunk)
    return digest.hexdigest()

def enqueue(filename: str, src: Path, channel: str, sender: str | None,
            move: bool = False, digest: str | None = None, received_on: str | None = None) -> dict:
    """Admit a file to the corpus, once. The same bytes arriving again — a
    double-click, a connector retrying — return the document already there.
    `digest` is the file's SHA-256 if the caller already has it."""
    digest = digest or _sha256(src)
    with src.open("rb") as fh:
        kind = sniff(fh.read(1024))
    if kind is None:
        raise ValueError(f"{filename} is not a PDF or an image")
    with _INGEST:                           # check-then-insert must not interleave
        if seen := db.one("SELECT id FROM documents WHERE content_hash=? AND status<>'error'",
                          (digest,)):
            if move:
                src.unlink(missing_ok=True)
            log.info("ingest skipped, identical to %s: %s", seen["id"], filename)
            return {"doc_id": seen["id"], "duplicate": True}
        doc_id = uuid.uuid4().hex[:12]
        dest = UPLOADS / f"{doc_id}{kind}"
        shutil.move(str(src), dest) if move else shutil.copyfile(src, dest)
        db.run("INSERT INTO documents (id,filename,title,source_channel,sender,status,stage,"
               "percent,content_hash,received_on) VALUES (?,?,?,?,?,'processing','Queued',2,?,?)",
               (doc_id, filename, filename, channel, sender, digest,
                received_on or config.today().isoformat()))
    _JOBS.put((doc_id, dest, filename))
    return {"doc_id": doc_id, "duplicate": False}

def recover() -> int:
    """Re-queue documents a restart caught mid-process; without this they sit at
    'processing' forever. Runs once, at server start-up."""
    stuck = db.q("SELECT id, filename FROM documents WHERE status='processing'")
    for r in stuck:
        path = original_path(r["id"])
        db.forget(r["id"])
        if path:
            db.set_stage(r["id"], "Queued", 2)
            _JOBS.put((r["id"], path, r["filename"]))
        else:
            db.run("UPDATE documents SET status='error', stage='Failed', percent=100,"
                   " error=? WHERE id=?", ("The upload was lost before processing finished",
                                           r["id"]))
    if stuck:
        log.warning("recovered %d document(s) left mid-process by a restart", len(stuck))
    return len(stuck)
