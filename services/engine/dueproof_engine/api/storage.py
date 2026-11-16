"""The engine's only network I/O: GET the source from its signed URL, PUT page
images to theirs. Nothing else in the engine opens a connection.

* http and https only, no redirects (a signed URL never redirects, and
  following one is how a fetch gets steered somewhere it should not go);
* optional host allowlist, DUEPROOF_ALLOWED_HOSTS ("r2.example.com,
  *.r2.cloudflarestorage.com"), for deployments that know their storage;
* the body is streamed and cut off at MAX_SOURCE_BYTES, whatever
  Content-Length claimed;
* timeouts on every request.

URLs are never logged: a presigned URL is a credential until it expires.
"""
from __future__ import annotations

import fnmatch
import os
from urllib.parse import urlsplit

import httpx

from dueproof_engine import config
from dueproof_engine.pipeline.pdf import ReadError


class StorageError(Exception):
    """The source could not be fetched or an image could not be stored.
    Retryable from the caller's side; not a property of the document."""


def _allowed_hosts() -> list[str]:
    return [h.strip().lower() for h in os.environ.get("DUEPROOF_ALLOWED_HOSTS", "").split(",")
            if h.strip()]


def check_url(url: str) -> None:
    """Refuse anything but an http(s) URL to an allowed host."""
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise StorageError("only http and https URLs are accepted")
    if (allowed := _allowed_hosts()) and not any(fnmatch.fnmatch(parts.hostname.lower(), pat)
                                                 for pat in allowed):
        raise StorageError("host is not in DUEPROOF_ALLOWED_HOSTS")


def _client(timeout: float) -> httpx.Client:
    return httpx.Client(timeout=httpx.Timeout(timeout), follow_redirects=False,
                        headers={"User-Agent": "dueproof-engine"})


def fetch(url: str, max_bytes: int | None = None) -> bytes:
    """The bytes at a signed GET URL. ReadError("too_large") past the cap."""
    limit = max_bytes or config.MAX_SOURCE_BYTES
    check_url(url)
    try:
        with _client(config.FETCH_TIMEOUT) as client, client.stream("GET", url) as resp:
            if resp.status_code != 200:
                raise StorageError(f"source GET answered {resp.status_code}")
            declared = resp.headers.get("content-length")
            if declared and declared.isdigit() and int(declared) > limit:
                raise ReadError("too_large", f"The file is over the {limit // (1024 * 1024)} MB limit")
            chunks, total = [], 0
            for chunk in resp.iter_bytes(1 << 16):
                total += len(chunk)
                if total > limit:
                    raise ReadError("too_large", f"The file is over the {limit // (1024 * 1024)} MB limit")
                chunks.append(chunk)
            return b"".join(chunks)
    except httpx.HTTPError as exc:
        raise StorageError(f"source GET failed: {type(exc).__name__}") from exc


def put(url: str, data: bytes, content_type: str = "image/webp") -> None:
    """PUT bytes to a signed URL."""
    check_url(url)
    try:
        with _client(config.PUT_TIMEOUT) as client:
            resp = client.put(url, content=data, headers={"Content-Type": content_type})
    except httpx.HTTPError as exc:
        raise StorageError(f"image PUT failed: {type(exc).__name__}") from exc
    if not 200 <= resp.status_code < 300:
        raise StorageError(f"image PUT answered {resp.status_code}")
