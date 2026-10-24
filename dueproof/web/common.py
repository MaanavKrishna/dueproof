"""Helpers the route modules share."""
from __future__ import annotations

from datetime import date

from fastapi import HTTPException, Request

from dueproof.records import record_audit

def actor(request: Request) -> str:
    """Who is acting: the signed-in user, or — with sign-in off — the client address."""
    user = getattr(request.state, "user", None)
    return user["email"] if user else request.client.host if request.client else "unknown"

def audit(request: Request, action: str, doc_id: str | None = None, **detail) -> None:
    if role := request.query_params.get("role"):
        detail["role"] = role
    record_audit(actor(request), action, doc_id, detail or None)

def valid_date(value: str) -> str:
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        raise HTTPException(422, "dates are YYYY-MM-DD") from None
