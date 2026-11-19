"""Caller authentication: a short-lived HMAC-SHA256 token.

Every request carries `Authorization: Bearer <token>`. The token is a compact
JWS with HS256 — a standard JWT, so any JWT library can mint it:

    base64url({"alg":"HS256","typ":"JWT"}) . base64url({"aud":"engine","exp":<unix s>}) . base64url(sig)

signed with ENGINE_SHARED_SECRET (at least 32 bytes). The engine accepts it
only if the signature matches, `aud` is "engine", it has not expired, and it
expires within MAX_LIFETIME seconds of now: a long-lived token is refused even
when correctly signed. Comparison is constant-time. Nothing about the token is
logged.

ENGINE_AUTH=none switches checking off for local development only; the
engine logs a warning at start-up when it is off.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import math
import os
import re
import time

AUDIENCE = "engine"
MAX_LIFETIME = int(os.environ.get("ENGINE_TOKEN_MAX_LIFETIME") or 900)   # seconds
LEEWAY = 30                                                               # clock skew, seconds
MIN_SECRET_BYTES = 32


class AuthError(Exception):
    """The request is not from a caller holding the shared secret."""


class NotConfigured(Exception):
    """The engine has no (usable) shared secret, so it can authenticate nobody."""


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


_B64URL = re.compile(r"[A-Za-z0-9_-]+")


def _b64d(text: str) -> bytes:
    """Strict base64url without padding: one spelling per value, nothing skipped."""
    if not _B64URL.fullmatch(text) or len(text) % 4 == 1:
        raise ValueError("not base64url")
    raw = base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))
    if _b64e(raw) != text:                       # non-zero trailing bits: another spelling
        raise ValueError("not canonical base64url")
    return raw


def disabled() -> bool:
    return os.environ.get("ENGINE_AUTH", "").lower() == "none"


def secret() -> bytes:
    value = os.environ.get("ENGINE_SHARED_SECRET", "").encode("utf-8")
    if len(value) < MIN_SECRET_BYTES:
        raise NotConfigured("ENGINE_SHARED_SECRET is missing or shorter than 32 bytes")
    return value


def make_token(key: bytes | str, ttl: int = 300, now: float | None = None, **claims) -> str:
    """Mint a token (tests, scripts and the reference for the TypeScript client)."""
    key = key.encode("utf-8") if isinstance(key, str) else key
    head = _b64e(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    body = _b64e(json.dumps({"aud": AUDIENCE, "exp": int((now or time.time()) + ttl), **claims},
                            separators=(",", ":")).encode())
    sig = hmac.new(key, f"{head}.{body}".encode("ascii"), hashlib.sha256).digest()
    return f"{head}.{body}.{_b64e(sig)}"


def verify_token(token: str, key: bytes, now: float | None = None) -> dict:
    """The token's claims if it is valid; AuthError otherwise. Error messages
    say what was wrong, never what the token contained."""
    now = time.time() if now is None else now
    parts = token.split(".")
    if len(parts) != 3 or not all(parts) or not token.isascii():
        raise AuthError("malformed token")
    head_b64, body_b64, sig_b64 = parts
    try:
        sig = _b64d(sig_b64)
        head = json.loads(_b64d(head_b64))
    except (ValueError, json.JSONDecodeError) as exc:
        raise AuthError("malformed token") from exc
    if not isinstance(head, dict) or head.get("alg") != "HS256":
        raise AuthError("unsupported algorithm")
    want = hmac.new(key, f"{head_b64}.{body_b64}".encode("ascii"), hashlib.sha256).digest()
    if not hmac.compare_digest(sig, want):
        raise AuthError("bad signature")
    try:
        claims = json.loads(_b64d(body_b64))
    except (ValueError, json.JSONDecodeError) as exc:
        raise AuthError("malformed token") from exc
    if not isinstance(claims, dict):
        raise AuthError("malformed token")
    aud = claims.get("aud")
    if aud != AUDIENCE and not (isinstance(aud, list) and AUDIENCE in aud):
        raise AuthError("wrong audience")
    exp = claims.get("exp")
    if not isinstance(exp, (int, float)) or isinstance(exp, bool) or not math.isfinite(exp):
        raise AuthError("no expiry")
    if exp < now - LEEWAY:
        raise AuthError("expired")
    if exp > now + MAX_LIFETIME + LEEWAY:
        raise AuthError("lifetime too long")
    return claims


def check(authorization: str | None) -> None:
    """Authenticate one request from its Authorization header."""
    if disabled():
        return
    key = secret()
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise AuthError("missing bearer token")
    verify_token(token.strip(), key)
