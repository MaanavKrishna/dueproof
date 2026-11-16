"""The engine's HTTP service (FastAPI). Stateless: no database, no disk, no
model calls. The contract is packages/contracts/src/engine.ts.

    POST /v1/inspect    page count, encryption, which pages have a text layer
    POST /v1/read       per-page text and word boxes; page images PUT to signed URLs
    POST /v1/translate  English for non-English segments (engine-heavy), else engine "none"
    POST /v1/analyze    rule-based findings with verbatim quotes and DateRules
    POST /v1/link       locate quotes on pages (the proof)
    GET  /health        liveness and what this deployment can do (no auth)

Errors are JSON {"error", "reason"?, "message"?}:
    401 unauthorised      the bearer token is missing, bad, expired or too long-lived
    413 too_large         the request body is over DUEPROOF_MAX_BODY_BYTES
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

app = FastAPI(title="Dueproof engine", version=__version__, docs_url=None, redoc_url=None,
              openapi_url="/openapi.json")

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


@app.middleware("http")
async def request_context(request: Request, call_next):
    """A request id on every response and log line; a body-size cap before
    anything is parsed. Bodies, URLs and tokens are never logged."""
    token = rid.set(request.headers.get("x-request-id", "")[:64] or uuid.uuid4().hex[:12])
    t0 = time.perf_counter()
    try:
        declared = request.headers.get("content-length")
        if declared and declared.isdigit() and int(declared) > MAX_BODY_BYTES:
            response = _error(413, "too_large", message="request body over the limit")
        else:
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
def health() -> dict:
    """Liveness and capabilities, without loading any model."""
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
