"""Documents: uploading, the queue, one card, page images."""
from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import date, timedelta
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from dueproof import config, db, ingest, records
from dueproof.web.common import audit, valid_date

log = logging.getLogger("dueproof.web")

router = APIRouter()

@router.post("/api/upload")
def upload(request: Request, file: UploadFile = File(...), channel: str = Form(""),
           sender: str = Form(""), received_on: str = Form("")):
    # A plain `def`: FastAPI runs it on a worker thread, so the blocking file
    # writes below do not sit on the event loop.
    if not file.filename:
        raise HTTPException(400, "no filename")
    tmp = config.UPLOADS / f"tmp-{uuid.uuid4().hex}"
    try:
        written, digest = 0, hashlib.sha256()
        with tmp.open("wb") as fh:
            while chunk := file.file.read(1 << 20):
                if not written and ingest.sniff(chunk) is None:
                    raise HTTPException(415, "Not a PDF or an image (JPEG, PNG, TIFF)")
                written += len(chunk)
                if written > config.MAX_UPLOAD_BYTES:
                    raise HTTPException(413, f"Over the {config.MAX_UPLOAD_BYTES >> 20} MB limit")
                fh.write(chunk)
                digest.update(chunk)        # hashed on the way in, not re-read afterwards
        if not written:
            raise HTTPException(400, "File is empty")
        got = ingest.enqueue(Path(file.filename).name, tmp, channel if channel in config.CHANNELS else config.CHANNELS[-1],
                      sender or None, move=True, digest=digest.hexdigest(),
                      received_on=valid_date(received_on) if received_on else None)
        audit(request, "upload", got["doc_id"], filename=Path(file.filename).name,
              bytes=written, duplicate=got["duplicate"])
        return got
    finally:
        tmp.unlink(missing_ok=True)       # no-op once enqueue has moved it

@router.post("/api/inbox/scan")
def inbox_scan(request: Request):
    """Ingest anything new in data/inbox: the simplest connector there is, and
    the seam where a mail or document-management connector plugs in. Files are
    copied, not moved; the content hash is what stops a second scan, or a
    renamed copy, being processed again."""
    started = []
    for path in sorted(p for p in config.INBOX.iterdir()
                       if p.is_file() and p.suffix.lower() in ingest.ACCEPTED_SUFFIXES):
        # Name the channel from the filename prefix, e.g. Scan-2026-08-07.pdf
        channel = next((c for c in config.CHANNELS if path.name.lower().startswith(c.lower())),
                       config.CHANNELS[0])
        try:
            got = ingest.enqueue(path.name, path, channel, None)
        except ValueError:
            log.warning("inbox: %s is not a PDF or an image; skipped", path.name)
            continue
        if not got["duplicate"]:
            started.append({"doc_id": got["doc_id"], "filename": path.name, "channel": channel})
            audit(request, "inbox_ingest", got["doc_id"], filename=path.name, channel=channel)
    return {"started": started}

@router.get("/api/status/{doc_id}")
def status(doc_id: str):
    # Named columns, not SELECT *: this runs twice a second and full_text is large.
    r = db.one("SELECT stage, percent, status, error FROM documents WHERE id=?", (doc_id,))
    if not r:
        raise HTTPException(404, "unknown document")
    return dict(r, done=r["status"] in ("done", "error"))

@router.get("/api/documents")
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
        where.append(records.HAS_ROLE)
        args.append(role)
    clause = f" WHERE {' AND '.join(where)}" if where else ""
    response.headers["X-Total-Count"] = str(
        db.one(f"SELECT COUNT(*) n FROM documents d{clause}", args)["n"])
    rows = db.q(f"SELECT {records.DOC_COLS}, (SELECT COUNT(*) FROM findings f WHERE f.doc_id=d.id"
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
    return [dict(records.doc(r), roles=sorted(roles.get(r["id"], ()))) for r in rows]

@router.get("/api/document/{doc_id}")
def document(request: Request, doc_id: str):
    r = db.one(f"SELECT {records.DOC_COLS} FROM documents d WHERE d.id=?", (doc_id,))
    if not r:
        raise HTTPException(404, "unknown document")
    audit(request, "view_document", doc_id)
    findings = [records.finding(f) for f in db.q(
        "SELECT * FROM findings WHERE doc_id=? ORDER BY kind DESC, ord", (doc_id,))]
    return dict(records.doc(r),
                bullets=[f for f in findings if f["kind"] == "bullet"],
                obligations=[f for f in findings if f["kind"] == "obligation"],
                duplicates=[dict(db.one("SELECT id,title,source_channel FROM documents"
                                        " WHERE id=?", (x["other_id"],)) or {}, score=x["score"])
                            for x in db.q("SELECT * FROM duplicates WHERE doc_id=?", (doc_id,))])

class DocumentEdit(BaseModel):
    received_on: str | None = None
    title: str | None = Field(default=None, max_length=300)

@router.patch("/api/documents/{doc_id}")
def edit_document(request: Request, doc_id: str, body: DocumentEdit):
    """Correct when a document arrived (deadlines that run from receipt move
    with it) or what it is called."""
    d = db.one("SELECT * FROM documents WHERE id=?", (doc_id,))
    if not d:
        raise HTTPException(404, "unknown document")
    sent = body.model_dump(exclude_unset=True)
    if sent.get("received_on"):
        received = valid_date(body.received_on)
        if received > config.today().isoformat():
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
    return records.doc(db.one(f"SELECT {records.DOC_COLS} FROM documents d WHERE d.id=?", (doc_id,)))

@router.get("/api/page/{doc_id}/{page_num}.jpg")
def page_image(doc_id: str, page_num: int):
    # doc_id lands in a filesystem path, so resolve and confirm it stayed inside
    # PAGES — otherwise %2E%2E in the URL walks out of the directory.
    path = (config.PAGES / doc_id / f"{page_num}.jpg").resolve()
    if config.PAGES.resolve() not in path.parents or not path.is_file():
        raise HTTPException(404, "no such page")
    return FileResponse(path, media_type="image/jpeg",
                        headers={"Cache-Control": "public, max-age=86400"})
