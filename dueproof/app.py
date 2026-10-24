"""Dueproof — FastAPI backend: JSON API + static frontend in one process.

Per document a worker thread runs read -> analyze -> translate -> link, writing
its stage to the database as it goes so /api/status stays responsive.
"""
from __future__ import annotations

import contextvars
import hashlib
import json
import logging
import os
import queue
import shutil
import threading
import time
import uuid
from contextlib import asynccontextmanager
from datetime import date, timedelta
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel, Field
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from dueproof import __version__, auth, db
from dueproof import export
from dueproof.config import (AUTH, CHANNELS, INBOX, LOCALS, MAX_UPLOAD_BYTES, ORG_NAME, PAGES,
                    PRODUCT, SECURE_COOKIES, STATIC, UPLOADS, today)
from dueproof.pipeline.analyze import analyze
from dueproof.pipeline.link import (CANDIDATE_KEYS, build_index, confidence_of, find_all, link_quote,
                           near_duplicate_score, signature)
from dueproof.pipeline.read import read_image, read_pdf
from dueproof.pipeline.translate import translate_findings, translator, warm
from dueproof.profiles import NAME as PROFILE_NAME, ROLES

# logging — every line carries the request (or document) it belongs to
rid: contextvars.ContextVar[str] = contextvars.ContextVar("rid", default="-")

class _RequestId(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.rid = rid.get()
        return True

def _setup_logging() -> logging.Logger:
    root = logging.getLogger("dueproof")
    if not root.handlers:
        handler = logging.StreamHandler()
        handler.addFilter(_RequestId())
        handler.setFormatter(logging.Formatter(
            "%(asctime)s %(levelname)s %(name)s [%(rid)s] %(message)s"))
        root.addHandler(handler)
        root.setLevel(os.environ.get("DUEPROOF_LOG_LEVEL", "INFO").upper())
        root.propagate = False
    return logging.getLogger("dueproof.app")

log = _setup_logging()

@asynccontextmanager
async def _lifespan(_: FastAPI):
    recover()
    yield

app = FastAPI(title=PRODUCT, lifespan=_lifespan)
db.init()
warm()          # load the translation model in the background, not mid-demo

# Everything the app serves is its own: no inline script, no third-party
# origin, no framing. The evidence report sets its own, looser style rule.
SECURITY_HEADERS = {
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self';"
                               " script-src 'self'; object-src 'none'; base-uri 'none';"
                               " form-action 'self'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
}

@app.middleware("http")
async def _request_log(request: Request, call_next):
    rid.set(uuid.uuid4().hex[:12])
    t0 = time.perf_counter()
    # Refuse an oversized body before reading it: by the time a handler runs,
    # the framework has already spooled the whole upload to disk.
    declared = request.headers.get("content-length", "")
    path = request.url.path
    request.state.user = None
    refusal = None
    if path.startswith("/api/"):
        if request.method in auth.UNSAFE and request.headers.get(auth.CSRF_HEADER) != "1":
            refusal = (403, f"Missing the {auth.CSRF_HEADER} header")
        elif path not in auth.PUBLIC:
            request.state.user, why = auth.identify(request)
            if why:
                refusal = (401, why)
    if refusal:
        response: Response = JSONResponse({"detail": refusal[1]}, status_code=refusal[0])
    elif declared.isdigit() and int(declared) > MAX_UPLOAD_BYTES + (1 << 20):
        response = JSONResponse(
            {"detail": f"Over the {MAX_UPLOAD_BYTES >> 20} MB limit"}, status_code=413)
    else:
        response = await call_next(request)
    response.headers["X-Request-ID"] = rid.get()
    for k, v in SECURITY_HEADERS.items():
        response.headers.setdefault(k, v)
    # The status poll runs twice a second per open document; logging it would
    # bury everything else.
    if path.startswith("/api/") and not path.startswith("/api/status/"):
        log.info("%s %s -> %d in %.0fms", request.method, path, response.status_code,
                 (time.perf_counter() - t0) * 1000)
    return response

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
                        received=date.fromisoformat(received) if received else today())
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
                received_on or today().isoformat()))
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

# audit — who looked at what, append-only (the table refuses UPDATE and DELETE)
def audit(request: Request, action: str, doc_id: str | None = None, **detail) -> None:
    """Who did it: the signed-in user, or — with sign-in switched off — only
    the client address."""
    actor = (user["email"] if (user := getattr(request.state, "user", None))
             else request.client.host if request.client else "unknown")
    if role := request.query_params.get("role"):
        detail["role"] = role
    db.run("INSERT INTO audit (request_id, actor, action, doc_id, detail) VALUES (?,?,?,?,?)",
           (rid.get(), actor, action, doc_id,
            json.dumps(detail, ensure_ascii=False) if detail else None))

# serialisation — everything the UI needs, and notably not full_text
DOC_COLS = ", ".join("d." + c for c in (
    "id", "filename", "title", "doc_type", "languages", "page_count", "text_source",
    "ocr_confidence", "source_channel", "sender", "status", "stage", "percent", "doc_date",
    "received_on", "reference", "authority", "amount", "amount_text", "sections"))

def _doc(r: dict) -> dict:
    return dict(r, title=r["title"] or r["filename"], languages=db.jload(r["languages"]),
                sections=db.jload(r.get("sections")))

def _finding(r: dict) -> dict:
    """A finding as people see it: their corrections applied, the original kept."""
    found_roles = db.jload(r["roles"])
    roles = db.jload(r["roles_override"]) if r.get("roles_override") else found_roles
    return {"id": r["id"], "doc_id": r["doc_id"], "kind": r["kind"], "text_en": r["text_en"],
            "text_local": r["text_local"], "due_date": r.get("due_override") or r["due_date"],
            "found_due_date": r["due_date"], "severity": r["severity"],
            "roles": roles, "found_roles": found_roles, "status": r.get("status") or "open",
            "assignee": r.get("assignee"), "note": r.get("note"),
            "edited": bool(r.get("updated_at")), "evidence_quote": r["evidence_quote"],
            "section": r.get("section"), "tag": r.get("tag"), "due_basis": r.get("due_basis"),
            "page": r["page_num"], "rects": db.jload(r["rects_json"]),
            "match_score": r["match_score"], "orig_lang": r["orig_lang"],
            "translated": bool(r["translated"]), "term_flags": db.jload(r.get("term_flags")),
            "confidence": confidence_of(r["match_score"])}

# API
@app.get("/api/meta")
def meta():
    # `locals` tells the interface which languages are read beside English,
    # what to call them, and which characters belong to their scripts.
    return {"product": PRODUCT, "org": ORG_NAME, "roles": ROLES, "channels": CHANNELS,
            "today": today().isoformat(), "version": __version__, "auth": AUTH,
            "profile": PROFILE_NAME,
            "needs_setup": AUTH == "local" and not db.one("SELECT 1 x FROM users"),
            "locals": [{k: lang[k] for k in ("code", "name", "english", "script")}
                       for lang in LOCALS]}

@app.get("/api/version")
def version():
    return {"version": __version__}

class Login(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=1024)

@app.post("/api/login")
def login(request: Request, body: Login, response: Response):
    if AUTH != "local":
        raise HTTPException(404, "Sign-in is handled elsewhere")
    client = request.client.host if request.client else "unknown"
    if auth.login_blocked(body.email, client):
        raise HTTPException(429, "Too many attempts. Try again in a few minutes.")
    user = auth.authenticate(body.email, body.password)
    if not user:
        auth.login_failed(body.email, client)
        log.warning("failed sign-in for %s from %s", body.email[:80], client)
        raise HTTPException(401, "Wrong email or password")
    auth.login_succeeded(body.email, client)
    token = auth.start_session(user["id"])
    response.set_cookie(auth.COOKIE, token, max_age=auth.SESSION_DAYS * 86400, httponly=True,
                        samesite="strict", secure=SECURE_COOKIES, path="/")
    request.state.user = user
    audit(request, "sign_in")
    return auth.public_user(user)

@app.post("/api/logout")
def logout(request: Request, response: Response):
    auth.end_session(request.cookies.get(auth.COOKIE))
    response.delete_cookie(auth.COOKIE, path="/")
    audit(request, "sign_out")
    return {"ok": True}

@app.get("/api/me")
def me(request: Request):
    """Who is signed in — asked before anything else, so it answers rather
    than refusing: signed_in false means show the sign-in screen."""
    if auth.AUTH == "none":
        return {"signed_in": True, "email": None, "name": None, "desk": None, "is_admin": True}
    user, _ = auth.identify(request)
    return dict(auth.public_user(user), signed_in=True) if user else {"signed_in": False}

@app.get("/api/users")
def users():
    """Who a finding can be assigned to."""
    return [auth.public_user(u) for u in db.q("SELECT * FROM users WHERE disabled=0 ORDER BY name")]

@app.post("/api/upload")
def upload(request: Request, file: UploadFile = File(...), channel: str = Form(""),
           sender: str = Form(""), received_on: str = Form("")):
    # A plain `def`: FastAPI runs it on a worker thread, so the blocking file
    # writes below do not sit on the event loop.
    if not file.filename:
        raise HTTPException(400, "no filename")
    tmp = UPLOADS / f"tmp-{uuid.uuid4().hex}"
    try:
        written, digest = 0, hashlib.sha256()
        with tmp.open("wb") as fh:
            while chunk := file.file.read(1 << 20):
                if not written and sniff(chunk) is None:
                    raise HTTPException(415, "Not a PDF or an image (JPEG, PNG, TIFF)")
                written += len(chunk)
                if written > MAX_UPLOAD_BYTES:
                    raise HTTPException(413, f"Over the {MAX_UPLOAD_BYTES >> 20} MB limit")
                fh.write(chunk)
                digest.update(chunk)        # hashed on the way in, not re-read afterwards
        if not written:
            raise HTTPException(400, "File is empty")
        got = enqueue(Path(file.filename).name, tmp, channel if channel in CHANNELS else CHANNELS[-1],
                      sender or None, move=True, digest=digest.hexdigest(),
                      received_on=_valid_date(received_on) if received_on else None)
        audit(request, "upload", got["doc_id"], filename=Path(file.filename).name,
              bytes=written, duplicate=got["duplicate"])
        return got
    finally:
        tmp.unlink(missing_ok=True)       # no-op once enqueue has moved it

@app.post("/api/inbox/scan")
def inbox_scan(request: Request):
    """Ingest anything new in data/inbox: the simplest connector there is, and
    the seam where a mail or document-management connector plugs in. Files are
    copied, not moved; the content hash is what stops a second scan, or a
    renamed copy, being processed again."""
    started = []
    for path in sorted(p for p in INBOX.iterdir()
                       if p.is_file() and p.suffix.lower() in ACCEPTED_SUFFIXES):
        # Name the channel from the filename prefix, e.g. Scan-2026-08-07.pdf
        channel = next((c for c in CHANNELS if path.name.lower().startswith(c.lower())),
                       CHANNELS[0])
        try:
            got = enqueue(path.name, path, channel, None)
        except ValueError:
            log.warning("inbox: %s is not a PDF or an image; skipped", path.name)
            continue
        if not got["duplicate"]:
            started.append({"doc_id": got["doc_id"], "filename": path.name, "channel": channel})
            audit(request, "inbox_ingest", got["doc_id"], filename=path.name, channel=channel)
    return {"started": started}

@app.get("/health")
def health():
    """Liveness plus the few numbers an operator looks at first."""
    from dueproof.pipeline import translate
    counts = {r["status"]: r["n"] for r in db.q(
        "SELECT status, COUNT(*) n FROM documents GROUP BY status")}
    mt = ("disabled" if not translate.MT_ENABLED else "loading" if not translate._state["loaded"]
          else "ready" if translate._state["ok"] else "unavailable")
    return {"status": "ok", "today": today().isoformat(), "queue_depth": _JOBS.qsize(),
            "workers": WORKERS, "documents": counts, "translation": mt,
            "findings": db.one("SELECT COUNT(*) n FROM findings")["n"]}

@app.get("/api/status/{doc_id}")
def status(doc_id: str):
    # Named columns, not SELECT *: this runs twice a second and full_text is large.
    r = db.one("SELECT stage, percent, status, error FROM documents WHERE id=?", (doc_id,))
    if not r:
        raise HTTPException(404, "unknown document")
    return dict(r, done=r["status"] in ("done", "error"))

_HAS_ROLE = ("EXISTS (SELECT 1 FROM findings f, json_each(COALESCE(f.roles_override, f.roles)) j"
             " WHERE f.doc_id=d.id AND j.value=?)")

@app.get("/api/documents")
def documents(response: Response, role: str = "", channel: str = "",
              limit: int = 100, offset: int = 0):
    """One page of the queue, newest first; X-Total-Count carries the full size.
    Both filters run in SQL, so a page costs the same at eleven documents or
    eleven thousand."""
    limit, offset = max(1, min(limit, 500)), max(0, offset)
    where, args = [], []
    if channel:
        where.append("d.source_channel=?")
        args.append(channel)
    if role:
        # Every finding, not just obligations: a document whose payment terms
        # are stated as prose still belongs on Finance's desk.
        where.append(_HAS_ROLE)
        args.append(role)
    clause = f" WHERE {' AND '.join(where)}" if where else ""
    response.headers["X-Total-Count"] = str(
        db.one(f"SELECT COUNT(*) n FROM documents d{clause}", args)["n"])
    rows = db.q(f"SELECT {DOC_COLS}, (SELECT COUNT(*) FROM findings f WHERE f.doc_id=d.id"
                f" AND f.kind='obligation' AND f.status='open'"
                f" AND COALESCE(f.due_override, f.due_date) IS NOT NULL) deadline_count"
                f" FROM documents d{clause} ORDER BY d.created_at DESC, d.rowid DESC"
                f" LIMIT ? OFFSET ?", (*args, limit, offset))
    roles: dict[str, set[str]] = {}
    if rows:
        marks = ",".join("?" * len(rows))
        for f in db.q(f"SELECT doc_id, COALESCE(roles_override, roles) roles FROM findings"
                      f" WHERE doc_id IN ({marks})", [r["id"] for r in rows]):
            roles.setdefault(f["doc_id"], set()).update(db.jload(f["roles"]))
    return [dict(_doc(r), roles=sorted(roles.get(r["id"], ()))) for r in rows]

@app.get("/api/document/{doc_id}")
def document(request: Request, doc_id: str):
    r = db.one(f"SELECT {DOC_COLS} FROM documents d WHERE d.id=?", (doc_id,))
    if not r:
        raise HTTPException(404, "unknown document")
    audit(request, "view_document", doc_id)
    findings = [_finding(f) for f in db.q(
        "SELECT * FROM findings WHERE doc_id=? ORDER BY kind DESC, ord", (doc_id,))]
    return dict(_doc(r),
                bullets=[f for f in findings if f["kind"] == "bullet"],
                obligations=[f for f in findings if f["kind"] == "obligation"],
                duplicates=[dict(db.one("SELECT id,title,source_channel FROM documents"
                                        " WHERE id=?", (x["other_id"],)) or {}, score=x["score"])
                            for x in db.q("SELECT * FROM duplicates WHERE doc_id=?", (doc_id,))])

DUE = "COALESCE(f.due_override, f.due_date)"
ROLES_OF = "COALESCE(f.roles_override, f.roles)"
STATUSES = ("open", "done", "dismissed")

def _deadlines(role: str, days: int, limit: int, offset: int,
               status: str = "open") -> tuple[list[dict], int]:
    limit, offset = max(1, min(limit, 2000)), max(0, offset)
    now = today()
    where = f"f.kind='obligation' AND {DUE} IS NOT NULL AND {DUE}<=?"
    args: list = [(now + timedelta(days=days)).isoformat()]
    if status != "all":
        if status not in STATUSES:
            raise HTTPException(422, f"status must be one of {', '.join(STATUSES)} or all")
        where += " AND f.status=?"
        args.append(status)
    if role:
        where += f" AND EXISTS (SELECT 1 FROM json_each({ROLES_OF}) j WHERE j.value=?)"
        args.append(role)
    total = db.one(f"SELECT COUNT(*) n FROM findings f WHERE {where}", args)["n"]
    rows = db.q("SELECT f.*, d.doc_type, d.source_channel, d.title doc_title FROM findings f"
                f" JOIN documents d ON d.id=f.doc_id WHERE {where}"
                f" ORDER BY {DUE}, f.id LIMIT ? OFFSET ?", (*args, limit, offset))
    out = []
    for r in rows:
        item = _finding(r)
        left = (date.fromisoformat(item["due_date"]) - now).days
        out.append(dict(item, doc_type=r["doc_type"], doc_title=r["doc_title"],
                        source_channel=r["source_channel"], days_left=left,
                        overdue=left < 0 and item["status"] == "open"))
    return out, total

@app.get("/api/deadlines")
def deadlines(response: Response, role: str = "", days: int = 400, status: str = "open",
              limit: int = 500, offset: int = 0):
    """Every dated obligation in the corpus — the deadline line. Open ones by
    default; status=done, dismissed or all for the rest."""
    items, total = _deadlines(role, days, limit, offset, status)
    response.headers["X-Total-Count"] = str(total)
    return items

class FindingEdit(BaseModel):
    """Any subset of these. A due date or desks of null restores what was found."""
    status: str | None = None
    assignee: str | None = Field(default=None, max_length=254)
    due_date: str | None = None
    roles: list[str] | None = None
    note: str | None = Field(default=None, max_length=2000)

@app.patch("/api/findings/{finding_id}")
def edit_finding(request: Request, finding_id: str, body: FindingEdit):
    f = db.one("SELECT * FROM findings WHERE id=?", (finding_id,))
    if not f:
        raise HTTPException(404, "unknown finding")
    sent = body.model_dump(exclude_unset=True)
    changes: dict[str, object] = {}
    if "status" in sent:
        if body.status not in STATUSES:
            raise HTTPException(422, f"status must be one of {', '.join(STATUSES)}")
        changes["status"] = body.status
    if "assignee" in sent:
        changes["assignee"] = (body.assignee or "").strip() or None
    if "due_date" in sent:
        if body.due_date:
            try:
                date.fromisoformat(body.due_date)
            except ValueError:
                raise HTTPException(422, "due_date must be YYYY-MM-DD") from None
        changes["due_override"] = (body.due_date if body.due_date and body.due_date != f["due_date"]
                                   else None)
    if "roles" in sent:
        if body.roles is not None and (not body.roles or set(body.roles) - set(ROLES)):
            raise HTTPException(422, "roles must be a non-empty list of known desks")
        changes["roles_override"] = (json.dumps(body.roles, ensure_ascii=False)
                                     if body.roles and body.roles != db.jload(f["roles"]) else None)
    if "note" in sent:
        changes["note"] = (body.note or "").strip() or None
    changes = {k: v for k, v in changes.items() if v != f[k]}
    if changes:
        actor = ((request.state.user or {}).get("email")
                 or (request.client.host if request.client else "unknown"))
        db.runmany("INSERT INTO finding_edits (finding_id, actor, field, old, new) VALUES (?,?,?,?,?)",
                   [(finding_id, actor, k, f[k], v) for k, v in changes.items()])
        sets = ", ".join(f"{k}=?" for k in changes)
        db.run(f"UPDATE findings SET {sets}, updated_at=datetime('now'), updated_by=? WHERE id=?",
               (*changes.values(), actor, finding_id))
        audit(request, "edit_finding", f["doc_id"], finding=finding_id, fields=sorted(changes))
    return _finding(db.one("SELECT * FROM findings WHERE id=?", (finding_id,)))

def _valid_date(value: str) -> str:
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        raise HTTPException(422, "dates are YYYY-MM-DD") from None

class DocumentEdit(BaseModel):
    received_on: str | None = None
    title: str | None = Field(default=None, max_length=300)

@app.patch("/api/documents/{doc_id}")
def edit_document(request: Request, doc_id: str, body: DocumentEdit):
    """Correct when a document arrived (deadlines that run from receipt move
    with it) or what it is called."""
    d = db.one("SELECT * FROM documents WHERE id=?", (doc_id,))
    if not d:
        raise HTTPException(404, "unknown document")
    sent = body.model_dump(exclude_unset=True)
    if sent.get("received_on"):
        received = _valid_date(body.received_on)
        if received > today().isoformat():
            raise HTTPException(422, "a document cannot arrive in the future")
        db.run("UPDATE documents SET received_on=? WHERE id=?", (received, doc_id))
        for f in db.q("SELECT id, due_basis FROM findings WHERE doc_id=? AND due_basis LIKE 'receipt:%'",
                      (doc_id,)):
            due = date.fromisoformat(received) + timedelta(days=int(f["due_basis"].split(":")[1]))
            db.run("UPDATE findings SET due_date=? WHERE id=?", (due.isoformat(), f["id"]))
    if sent.get("title"):
        db.run("UPDATE documents SET title=? WHERE id=?", (body.title.strip(), doc_id))
    if sent:
        audit(request, "edit_document", doc_id, fields=sorted(sent))
    return _doc(db.one(f"SELECT {DOC_COLS} FROM documents d WHERE d.id=?", (doc_id,)))

@app.get("/api/findings/{finding_id}/history")
def finding_history(finding_id: str):
    if not db.one("SELECT 1 x FROM findings WHERE id=?", (finding_id,)):
        raise HTTPException(404, "unknown finding")
    return db.q("SELECT at, actor, field, old, new FROM finding_edits WHERE finding_id=?"
                " ORDER BY id", (finding_id,))

@app.get("/api/export/deadlines.{fmt}")
def export_deadlines(request: Request, fmt: str, role: str = "", days: int = 400,
                     status: str = "open"):
    """The deadline line as something to carry into a meeting: a spreadsheet,
    or a printable page where each obligation sits above the passage it came
    from (print it to PDF from the browser)."""
    if fmt not in ("csv", "html"):
        raise HTTPException(404, "unknown export format")
    items, _ = _deadlines(role, days, 2000, 0, status)
    audit(request, "export", None, format=fmt, rows=len(items))
    if fmt == "html":
        page = HTMLResponse(export.evidence_html(items, today(), role))
        # Its stylesheet is inline, so the page stays complete when saved.
        page.headers["Content-Security-Policy"] = (
            "default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'none'")
        return page
    name = f"dueproof-deadlines-{today().isoformat()}.csv"
    return Response(export.deadlines_csv(items), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})

@app.get("/api/search")
def search(request: Request, q: str = "", limit: int = 30):
    """Substring search over every page and every translated finding. Each hit
    comes back with the rectangles of the match, so a search result is provable
    on the page exactly as a finding is."""
    # Trigram index: a term needs three characters. Shorter words in a longer
    # query are dropped rather than failing the whole search.
    terms = [t for t in q.split() if len(t) >= 3][:8]
    if not terms:
        raise HTTPException(400, "Search needs at least three characters")
    limit = max(1, min(limit, 100))
    match = " AND ".join('"' + t.replace('"', '""') + '"' for t in terms)
    rows = db.q("SELECT s.body, s.doc_id, s.page_num, s.finding_id, d.title, d.filename,"
                " d.doc_type, d.source_channel FROM search s JOIN documents d ON d.id=s.doc_id"
                " WHERE search MATCH ? AND d.status='done' ORDER BY rank LIMIT ?", (match, limit))
    audit(request, "search", None, q=q[:200], hits=len(rows))
    out = []
    for r in rows:
        hit = {"doc_id": r["doc_id"], "title": r["title"] or r["filename"], "page": r["page_num"],
               "doc_type": r["doc_type"], "source_channel": r["source_channel"],
               "finding_id": r["finding_id"], "snippet": _snippet(r["body"], terms), "rects": []}
        if not r["finding_id"]:
            page = db.one("SELECT words FROM pages WHERE doc_id=? AND page_num=?",
                          (r["doc_id"], r["page_num"]))
            index = build_index({0: [dict(zip(("text", "x0", "y0", "x1", "y1", "line_id"), w))
                                     for w in db.jload(page and page["words"])]})
            if 0 in index:
                hit["rects"] = [rect for t in terms for rect in find_all(t, index[0])]
        out.append(hit)
    return {"terms": terms, "hits": out}

def _snippet(body: str, terms: list[str], width: int = 90) -> str:
    low = body.casefold()
    at = min((p for t in terms if (p := low.find(t.casefold())) >= 0), default=0)
    start = max(0, at - width)
    if start:
        start = body.find(" ", start, at) + 1 or start         # begin on a word
    end = min(len(body), at + width)
    return ("… " if start else "") + body[start:end].strip() + (" …" if end < len(body) else "")

@app.post("/api/audit/proof/{finding_id}")
def audit_proof(request: Request, finding_id: str):
    """The proof panel opens in the browser; this is how the server hears of it."""
    f = db.one("SELECT doc_id, page_num FROM findings WHERE id=?", (finding_id,))
    if not f:
        raise HTTPException(404, "unknown finding")
    audit(request, "view_proof", f["doc_id"], finding=finding_id, page=f["page_num"])
    return {"ok": True}

@app.get("/api/audit")
def audit_trail(doc_id: str = "", action: str = "", limit: int = 200, offset: int = 0):
    """The trail itself, newest first. Behind access control once there is any."""
    where, args = [], []
    for col, val in (("doc_id", doc_id), ("action", action)):
        if val:
            where.append(f"{col}=?")
            args.append(val)
    clause = f" WHERE {' AND '.join(where)}" if where else ""
    rows = db.q(f"SELECT * FROM audit{clause} ORDER BY id DESC LIMIT ? OFFSET ?",
                (*args, max(1, min(limit, 1000)), max(0, offset)))
    return [dict(r, detail=json.loads(r["detail"]) if r["detail"] else {}) for r in rows]

@app.get("/api/page/{doc_id}/{page_num}.jpg")
def page_image(doc_id: str, page_num: int):
    # doc_id lands in a filesystem path, so resolve and confirm it stayed inside
    # PAGES — otherwise %2E%2E in the URL walks out of the directory.
    path = (PAGES / doc_id / f"{page_num}.jpg").resolve()
    if PAGES.resolve() not in path.parents or not path.is_file():
        raise HTTPException(404, "no such page")
    return FileResponse(path, media_type="image/jpeg",
                        headers={"Cache-Control": "public, max-age=86400"})

app.mount("/", StaticFiles(directory=str(STATIC), html=True), name="static")
