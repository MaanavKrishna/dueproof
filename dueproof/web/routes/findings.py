"""Obligations: the deadline line, the workflow on each one, exports."""
from __future__ import annotations

import json
from datetime import date

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from dueproof import config, db, export, records
from dueproof.profiles import ROLES as PROFILE_ROLES
from dueproof.web.common import actor, audit

def _line(*args):
    try:
        return records.deadlines(*args)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None

router = APIRouter()

@router.get("/api/deadlines")
def deadlines(response: Response, role: str = "", days: int = 400, status: str = "open",
              limit: int = 500, offset: int = 0):
    """Every dated obligation in the corpus — the deadline line. Open ones by
    default; status=done, dismissed or all for the rest."""
    items, total = _line(role, days, limit, offset, status)
    response.headers["X-Total-Count"] = str(total)
    return items

class FindingEdit(BaseModel):
    """Any subset of these. A due date or desks of null restores what was found."""
    status: str | None = None
    assignee: str | None = Field(default=None, max_length=254)
    due_date: str | None = None
    roles: list[str] | None = None
    note: str | None = Field(default=None, max_length=2000)

@router.patch("/api/findings/{finding_id}")
def edit_finding(request: Request, finding_id: str, body: FindingEdit):
    f = db.one("SELECT * FROM findings WHERE id=?", (finding_id,))
    if not f:
        raise HTTPException(404, "unknown finding")
    sent = body.model_dump(exclude_unset=True)
    changes: dict[str, object] = {}
    if "status" in sent:
        if body.status not in records.STATUSES:
            raise HTTPException(422, f"status must be one of {', '.join(records.STATUSES)}")
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
        if body.roles is not None and (not body.roles or set(body.roles) - set(PROFILE_ROLES)):
            raise HTTPException(422, "roles must be a non-empty list of known desks")
        changes["roles_override"] = (json.dumps(body.roles, ensure_ascii=False)
                                     if body.roles and body.roles != db.jload(f["roles"]) else None)
    if "note" in sent:
        changes["note"] = (body.note or "").strip() or None
    changes = {k: v for k, v in changes.items() if v != f[k]}
    if changes:
        who = actor(request)
        db.runmany("INSERT INTO finding_edits (finding_id, actor, field, old, new) VALUES (?,?,?,?,?)",
                   [(finding_id, who, k, f[k], v) for k, v in changes.items()])
        sets = ", ".join(f"{k}=?" for k in changes)
        db.run(f"UPDATE findings SET {sets}, updated_at=datetime('now'), updated_by=? WHERE id=?",
               (*changes.values(), who, finding_id))
        audit(request, "edit_finding", f["doc_id"], finding=finding_id, fields=sorted(changes))
    return records.finding(db.one("SELECT * FROM findings WHERE id=?", (finding_id,)))

@router.get("/api/findings/{finding_id}/history")
def finding_history(finding_id: str):
    if not db.one("SELECT 1 x FROM findings WHERE id=?", (finding_id,)):
        raise HTTPException(404, "unknown finding")
    return db.q("SELECT at, actor, field, old, new FROM finding_edits WHERE finding_id=?"
                " ORDER BY id", (finding_id,))

@router.get("/api/export/deadlines.{fmt}")
def export_deadlines(request: Request, fmt: str, role: str = "", days: int = 400,
                     status: str = "open"):
    """The deadline line as something to carry into a meeting: a spreadsheet,
    or a printable page where each obligation sits above the passage it came
    from (print it to PDF from the browser)."""
    if fmt not in ("csv", "html"):
        raise HTTPException(404, "unknown export format")
    items, _ = _line(role, days, 2000, 0, status)
    audit(request, "export", None, format=fmt, rows=len(items))
    if fmt == "html":
        page = HTMLResponse(export.evidence_html(items, config.today(), role))
        # Its stylesheet is inline, so the page stays complete when saved.
        page.headers["Content-Security-Policy"] = (
            "default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'none'")
        return page
    name = f"dueproof-deadlines-{config.today().isoformat()}.csv"
    return Response(export.deadlines_csv(items), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})
