"""The app's own settings, health, search and the audit trail."""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Request

from dueproof import __version__, accounts, config, db, ingest
from dueproof.pipeline.link import build_index, find_all
from dueproof.profiles import NAME as PROFILE_NAME, ROLES
from dueproof.web.common import audit

router = APIRouter()

@router.get("/api/meta")
def meta():
    # `locals` tells the interface which languages are read beside English,
    # what to call them, and which characters belong to their scripts.
    return {"product": config.PRODUCT, "org": config.ORG_NAME, "roles": ROLES, "channels": config.CHANNELS,
            "today": config.today().isoformat(), "version": __version__, "auth": accounts.AUTH,
            "profile": PROFILE_NAME,
            "needs_setup": accounts.AUTH == "local" and not db.one("SELECT 1 x FROM users"),
            "locals": [{k: lang[k] for k in ("code", "name", "english", "script")}
                       for lang in config.LOCALS]}

@router.get("/health")
def health():
    """Liveness plus the few numbers an operator looks at first."""
    from dueproof.pipeline import translate
    counts = {r["status"]: r["n"] for r in db.q(
        "SELECT status, COUNT(*) n FROM documents GROUP BY status")}
    mt = ("disabled" if not translate.MT_ENABLED else "loading" if not translate._state["loaded"]
          else "ready" if translate._state["ok"] else "unavailable")
    return {"status": "ok", "today": config.today().isoformat(), "queue_depth": ingest._JOBS.qsize(),
            "workers": ingest.WORKERS, "documents": counts, "translation": mt,
            "findings": db.one("SELECT COUNT(*) n FROM findings")["n"]}

@router.get("/api/search")
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

@router.post("/api/audit/proof/{finding_id}")
def audit_proof(request: Request, finding_id: str):
    """The proof panel opens in the browser; this is how the server hears of it."""
    f = db.one("SELECT doc_id, page_num FROM findings WHERE id=?", (finding_id,))
    if not f:
        raise HTTPException(404, "unknown finding")
    audit(request, "view_proof", f["doc_id"], finding=finding_id, page=f["page_num"])
    return {"ok": True}

@router.get("/api/audit")
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
