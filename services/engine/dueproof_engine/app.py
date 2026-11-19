"""The engine's HTTP service (FastAPI). Stateless: no database, no disk, no
model calls. The contract is packages/contracts/src/engine.ts.

    POST /v1/inspect    page count, encryption, which pages have a text layer
    POST /v1/read       per-page text and word boxes; page images PUT to signed URLs
    POST /v1/translate  English for non-English segments (engine-heavy), else engine "none"
    POST /v1/analyze    rule-based findings with verbatim quotes and DateRules
    POST /v1/link       locate quotes on pages (the proof)
    GET  /health        liveness ({"status": "ok"}, no auth); with a valid token,
                        also what this deployment can do
    GET  /openapi.json  the schema, for token holders only (no /docs, no /redoc)

Every other path is checked by `Guard` before a byte of the body is read:
first the bearer token, then the body size, counted while streaming
(Content-Length is not trusted, and a chunked body has none).

Errors are JSON {"error", "reason"?, "message"?}:
    401 unauthorised      the bearer token is missing, bad, expired or too long-lived
    408 timeout           the request body took longer than DUEPROOF_BODY_TIMEOUT
    413 too_large         the request body is over DUEPROOF_MAX_BODY_BYTES
    415 encoded           the request body has a Content-Encoding (only raw JSON is read)
    422 unreadable        /v1/read on a document it cannot read; reason is the
                          contract's code (encrypted, malformed, too_large,
                          too_many_pages, unsupported). /v1/inspect answers
                          ok=false with the same reason instead.
    422 invalid_request   the body does not match the contract
    502 storage           the source could not be fetched or an image not stored (retry)
    503 not_configured    ENGINE_SHARED_SECRET is not set

Run:  uvicorn dueproof_engine.app:app --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import asyncio
import importlib.util
import logging
import os
import time
import uuid

from fastapi import Depends, FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from dueproof_engine import __version__, config
from dueproof_engine.api import auth, models as m, service, storage
from dueproof_engine.logs import rid
from dueproof_engine.pipeline.pdf import ReadError
from dueproof_engine.profiles import ProfileError

log = logging.getLogger("dueproof.app")
MAX_BODY_BYTES = int(os.environ.get("DUEPROOF_MAX_BODY_BYTES") or 20 * 1024 * 1024)
# The whole request body must arrive within this many seconds (a slow sender holds a worker).
BODY_TIMEOUT = float(os.environ.get("DUEPROOF_BODY_TIMEOUT") or 30)

app = FastAPI(title="Dueproof engine", version=__version__, docs_url=None, redoc_url=None,
              openapi_url="/openapi.json")

# Paths answered without a token. Everything else, /openapi.json included, needs one.
OPEN_PATHS = frozenset({"/health"})

if auth.disabled():
    log.warning("ENGINE_AUTH=none: every caller is trusted. Never run like this on a network.")


def _error(status: int, error: str, reason: str | None = None, message: str | None = None):
    body = {"error": error, **({"reason": reason} if reason else {}),
            **({"message": message} if message else {})}
    return JSONResponse(status_code=status, content=body)


class Refused(Exception):
    def __init__(self, status: int, error: str, message: str | None = None):
        self.status, self.error, self.message = status, error, message


def authorised(authorization: str | None = Header(default=None)) -> None:
    try:
        auth.check(authorization)
    except auth.NotConfigured as exc:
        raise Refused(503, "not_configured", str(exc)) from None
    except auth.AuthError as exc:
        raise Refused(401, "unauthorised", str(exc)) from None


class Guard:
    """Outermost ASGI layer: authenticate, then read the body with a cap.

    The token is checked from the headers before the body is read, so an
    unauthenticated caller can't make the engine take in 20 MB. The body is
    then counted chunk by chunk and refused past MAX_BODY_BYTES, whatever
    Content-Length said (or with none, for a chunked request), and handed on
    in full to the app."""

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.inner(scope, receive, send)
        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope["headers"]}
        request_id = headers.get("x-request-id", "")[:64] or uuid.uuid4().hex[:12]

        async def refuse(status: int, error: str, message: str) -> None:
            response = _error(status, error, message=message)
            response.headers["x-request-id"] = request_id
            await response(scope, receive, send)

        if scope["path"] not in OPEN_PATHS:
            try:
                auth.check(headers.get("authorization"))
            except auth.NotConfigured as exc:
                return await refuse(503, "not_configured", str(exc))
            except auth.AuthError as exc:
                return await refuse(401, "unauthorised", str(exc))
        if headers.get("content-encoding", "identity").strip().lower() not in ("", "identity"):
            return await refuse(415, "encoded", "send the body without a Content-Encoding")
        declared = headers.get("content-length", "")
        if declared.isdigit() and int(declared) > MAX_BODY_BYTES:
            return await refuse(413, "too_large", "request body over the limit")
        body = bytearray()
        deadline = time.monotonic() + BODY_TIMEOUT
        while True:
            try:
                message = await asyncio.wait_for(receive(), max(0.0, deadline - time.monotonic()))
            except TimeoutError:
                return await refuse(408, "timeout", "the request body took too long")
            if message["type"] == "http.disconnect":
                return None
            body += message.get("body", b"")
            if len(body) > MAX_BODY_BYTES:
                return await refuse(413, "too_large", "request body over the limit")
            if not message.get("more_body", False):
                break
        sent = False

        async def replay():
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        return await self.inner(scope, replay, send)


app.add_middleware(Guard)


@app.middleware("http")
async def request_context(request: Request, call_next):
    """A request id on every response and log line. Bodies, URLs and tokens
    are never logged. Authentication and the body cap are Guard's."""
    token = rid.set(request.headers.get("x-request-id", "")[:64] or uuid.uuid4().hex[:12])
    t0 = time.perf_counter()
    try:
        response = await call_next(request)
        response.headers["x-request-id"] = rid.get()
        if request.url.path != "/health":
            log.info("%s %s %d %d ms", request.method, request.url.path, response.status_code,
                     (time.perf_counter() - t0) * 1000)
        return response
    finally:
        rid.reset(token)


@app.exception_handler(Refused)
async def _refused(_: Request, exc: Refused):
    return _error(exc.status, exc.error, message=exc.message)


@app.exception_handler(ReadError)
async def _unreadable(_: Request, exc: ReadError):
    return _error(422, "unreadable", reason=exc.reason, message=str(exc))


@app.exception_handler(storage.StorageError)
async def _storage(_: Request, exc: storage.StorageError):
    return _error(502, "storage", message=str(exc))


@app.exception_handler(ProfileError)
async def _profile(_: Request, exc: ProfileError):
    return _error(422, "invalid_request", reason="profile", message=str(exc))


@app.exception_handler(RequestValidationError)
async def _invalid(_: Request, exc: RequestValidationError):
    # Field locations and messages only: never echo the input (it may be document text).
    detail = "; ".join(f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors()[:10])
    return _error(422, "invalid_request", message=detail)


SERIALISE = {"response_model_exclude_none": True}


@app.post("/v1/inspect", response_model=m.InspectResponse, dependencies=[Depends(authorised)],
          **SERIALISE)
def inspect(req: m.InspectRequest) -> m.InspectResponse:
    return service.inspect(req)


@app.post("/v1/read", response_model=m.ReadResponse, dependencies=[Depends(authorised)], **SERIALISE)
def read(req: m.ReadRequest) -> m.ReadResponse:
    return service.read(req)


@app.post("/v1/translate", response_model=m.TranslateResponse, dependencies=[Depends(authorised)],
          **SERIALISE)
def translate(req: m.TranslateRequest) -> m.TranslateResponse:
    return service.translate(req)


@app.post("/v1/analyze", response_model=m.AnalyzeResponse, dependencies=[Depends(authorised)],
          **SERIALISE)
def analyze(req: m.AnalyzeRequest) -> m.AnalyzeResponse:
    return service.analyze(req)


@app.post("/v1/link", response_model=m.LinkResponse, dependencies=[Depends(authorised)], **SERIALISE)
def link(req: m.LinkRequest) -> m.LinkResponse:
    return service.link(req)


@app.get("/health")
def health(authorization: str | None = Header(default=None)) -> dict:
    """Liveness for anyone; capabilities (version, rungs, translation) only for
    a caller with a valid token. Never loads a model."""
    try:
        auth.check(authorization)
    except (auth.AuthError, auth.NotConfigured):
        return {"status": "ok"}
    from dueproof_engine.ocr import paddle, tesseract
    try:
        paddle.model_dir()
        paddle_ok = True
    except paddle.Unavailable:
        paddle_ok = False
    heavy = importlib.util.find_spec("torch") is not None
    return {"status": "ok", "version": __version__, "api": m.ENGINE_API_VERSION,
            "rungs": {"text_layer": True, "paddleocr": paddle_ok, "tesseract": tesseract.available()},
            "translation": "indictrans2" if heavy and config.MT_ENABLED and config.MT_DIR.is_dir()
            else "none",
            "auth": "off" if auth.disabled() else "on"}
