"""Signing in and out, and who is who."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from dueproof import __version__, accounts, config, db
from dueproof.web.common import audit

import logging
log = logging.getLogger("dueproof.web")

router = APIRouter()

@router.get("/api/version")
def version():
    return {"version": __version__}

class Login(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=1024)

@router.post("/api/login")
def login(request: Request, body: Login, response: Response):
    if accounts.AUTH != "local":
        raise HTTPException(404, "Sign-in is handled elsewhere")
    client = request.client.host if request.client else "unknown"
    if accounts.login_blocked(body.email, client):
        raise HTTPException(429, "Too many attempts. Try again in a few minutes.")
    user = accounts.authenticate(body.email, body.password)
    if not user:
        accounts.login_failed(body.email, client)
        log.warning("failed sign-in for %s from %s", body.email[:80], client)
        raise HTTPException(401, "Wrong email or password")
    accounts.login_succeeded(body.email, client)
    token = accounts.start_session(user["id"])
    response.set_cookie(accounts.COOKIE, token, max_age=accounts.SESSION_DAYS * 86400, httponly=True,
                        samesite="strict", secure=config.SECURE_COOKIES, path="/")
    request.state.user = user
    audit(request, "sign_in")
    return accounts.public_user(user)

@router.post("/api/logout")
def logout(request: Request, response: Response):
    accounts.end_session(request.cookies.get(accounts.COOKIE))
    response.delete_cookie(accounts.COOKIE, path="/")
    audit(request, "sign_out")
    return {"ok": True}

@router.get("/api/me")
def me(request: Request):
    """Who is signed in — asked before anything else, so it answers rather
    than refusing: signed_in false means show the sign-in screen."""
    if accounts.AUTH == "none":
        return {"signed_in": True, "email": None, "name": None, "desk": None, "is_admin": True}
    user, _ = accounts.identify(request)
    return dict(accounts.public_user(user), signed_in=True) if user else {"signed_in": False}

@router.get("/api/users")
def users():
    """Who a finding can be assigned to."""
    return [accounts.public_user(u) for u in db.q("SELECT * FROM users WHERE disabled=0 ORDER BY name")]
