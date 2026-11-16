"""Reading documents and findings back out, the same way for the web app, the
exports and the reminder digest — with people's corrections applied and what
the pipeline found kept beside them."""
from __future__ import annotations

import json
from datetime import date, timedelta

from dueproof import config, db
from dueproof.logs import rid
from dueproof.pipeline.link import confidence_of

# serialisation — everything the UI needs, and notably not full_text
DOC_COLS = ", ".join("d." + c for c in (
    "id", "filename", "title", "doc_type", "languages", "page_count", "text_source",
    "ocr_confidence", "source_channel", "sender", "status", "stage", "percent", "doc_date",
    "received_on", "reference", "authority", "amount", "amount_text", "sections"))

def doc(r: dict) -> dict:
    return dict(r, title=r["title"] or r["filename"], languages=db.jload(r["languages"]),
                sections=db.jload(r.get("sections")))

def finding(r: dict) -> dict:
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

HAS_ROLE = ("EXISTS (SELECT 1 FROM findings f, json_each(COALESCE(f.roles_override, f.roles)) j"
             " WHERE f.doc_id=d.id AND j.value=?)")

DUE = "COALESCE(f.due_override, f.due_date)"
ROLES_OF = "COALESCE(f.roles_override, f.roles)"
STATUSES = ("open", "done", "dismissed")

def deadlines(role: str, days: int, limit: int, offset: int,
               status: str = "open") -> tuple[list[dict], int]:
    limit, offset = max(1, min(limit, 2000)), max(0, offset)
    now = config.today()
    where = f"f.kind='obligation' AND {DUE} IS NOT NULL AND {DUE}<=?"
    args: list = [(now + timedelta(days=days)).isoformat()]
    if status != "all":
        if status not in STATUSES:
            raise ValueError(f"status must be one of {', '.join(STATUSES)} or all")
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
        item = finding(r)
        left = (date.fromisoformat(item["due_date"]) - now).days
        out.append(dict(item, doc_type=r["doc_type"], doc_title=r["doc_title"],
                        source_channel=r["source_channel"], days_left=left,
                        overdue=left < 0 and item["status"] == "open"))
    return out, total

def record_audit(actor: str, action: str, doc_id: str | None = None, detail: dict | None = None) -> None:
    """One line in the append-only audit trail (the table refuses UPDATE and DELETE)."""
    db.run("INSERT INTO audit (request_id, actor, action, doc_id, detail) VALUES (?,?,?,?,?)",
           (rid.get(), actor, action, doc_id,
            json.dumps(detail, ensure_ascii=False) if detail else None))
