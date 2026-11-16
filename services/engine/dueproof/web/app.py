"""The FastAPI application: sign-in and CSRF checks, security headers and the
request log in one middleware; the API routes; the static interface.

Run it with `dueproof serve`.
"""
from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from dueproof import accounts, config, db, ingest
from dueproof.logs import rid
from dueproof.pipeline.translate import warm
from dueproof.web.routes import accounts as accounts_routes
from dueproof.web.routes import documents, findings, system

log = logging.getLogger("dueproof.app")

@asynccontextmanager
async def _lifespan(_: FastAPI):
    ingest.recover()
    yield

app = FastAPI(title=config.PRODUCT, lifespan=_lifespan)
db.init()
warm()          # load the translation model in the background, not on the first upload

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
        if request.method in accounts.UNSAFE and request.headers.get(accounts.CSRF_HEADER) != "1":
            refusal = (403, f"Missing the {accounts.CSRF_HEADER} header")
        elif path not in accounts.PUBLIC:
            request.state.user, why = accounts.identify(request)
            if why:
                refusal = (401, why)
    if refusal:
        response: Response = JSONResponse({"detail": refusal[1]}, status_code=refusal[0])
    elif declared.isdigit() and int(declared) > config.MAX_UPLOAD_BYTES + (1 << 20):
        response = JSONResponse(
            {"detail": f"Over the {config.MAX_UPLOAD_BYTES >> 20} MB limit"}, status_code=413)
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

for module in (system, accounts_routes, documents, findings):
    app.include_router(module.router)
app.mount("/", StaticFiles(directory=str(config.STATIC), html=True), name="static")
