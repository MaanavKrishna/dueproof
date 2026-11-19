"""The engine's only network I/O: GET the source from its signed URL, PUT page
images to theirs. Nothing else in the engine opens a connection.

* http and https only, no redirects (a signed URL never redirects, and
  following one is how a fetch gets steered somewhere it should not go);
* a host allowlist, DUEPROOF_ALLOWED_HOSTS (exact names, globs allowed:
  "app" on Compose; "<bucket>.<account>.r2.cloudflarestorage.com,
  <account>.r2.cloudflarestorage.com" on hosted R2). Empty refuses every
  host (fail closed), unless DUEPROOF_ALLOW_ANY_HOST=1 (development only) or
  ENGINE_AUTH=none (local development, which trusts every caller anyway);
* the name is resolved once, every address it resolves to is checked, and
  the connection goes to that checked address (no second lookup, so no DNS
  rebinding). A host matched by a glob must resolve to public addresses
  only: loopback, private, link-local (169.254/16, metadata services), CGNAT
  (100.64/10), IPv6 ULA and the like are refused. An exact entry ("app",
  "127.0.0.1") is the operator naming that host, so it may be internal;
* bodies are raw bytes: `Accept-Encoding: identity` is sent and any other
  Content-Encoding is refused, so nothing is inflated before it is counted.
  The body is streamed and cut off at MAX_SOURCE_BYTES, whatever
  Content-Length claimed;
* a deadline for the whole request (FETCH_TIMEOUT, PUT_TIMEOUT), checked
  between chunks on top of the per-read timeout, so a server that drips a
  byte at a time can't hold a request open: it ends within twice the
  timeout at worst;
* a PUT's response body is never read.

URLs are never logged: a presigned URL is a credential until it expires.
"""
from __future__ import annotations

import fnmatch
import ipaddress
import os
import socket
import time
from urllib.parse import urlsplit, urlunsplit

import httpx

from dueproof_engine import config
from dueproof_engine.api import auth
from dueproof_engine.pipeline.pdf import ReadError


class StorageError(Exception):
    """The source could not be fetched or an image could not be stored.
    Retryable from the caller's side; not a property of the document."""


def _allowed_hosts() -> list[str]:
    return [h.strip().lower() for h in os.environ.get("DUEPROOF_ALLOWED_HOSTS", "").split(",")
            if h.strip()]


def _any_host() -> bool:
    """Development only: no allowlist means any host."""
    return os.environ.get("DUEPROOF_ALLOW_ANY_HOST") == "1" or auth.disabled()


def _is_glob(pattern: str) -> bool:
    return any(c in pattern for c in "*?[")


def _split(url: str):
    """(scheme, host, port) or StorageError, never ValueError (`http://[::1/`)."""
    try:
        parts = urlsplit(url)
        host, port = parts.hostname, parts.port
    except ValueError:
        raise StorageError("the URL is malformed") from None
    if parts.scheme not in ("http", "https") or not host:
        raise StorageError("only http and https URLs are accepted")
    return parts, host.lower(), port or (443 if parts.scheme == "https" else 80)


def _policy(host: str) -> bool:
    """Whether `host` is allowed, and if so whether it may resolve to internal
    addresses (True) or must resolve to public ones only (False)."""
    allowed = _allowed_hosts()
    if not allowed:
        if _any_host():
            return True
        raise StorageError("DUEPROOF_ALLOWED_HOSTS is not set, so no host is allowed")
    if host in allowed or host.strip("[]") in allowed:
        return True
    if any(_is_glob(p) and fnmatch.fnmatch(host, p) for p in allowed):
        return False
    raise StorageError("host is not in DUEPROOF_ALLOWED_HOSTS")


def _public(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    if ip in ipaddress.ip_network("100.64.0.0/10"):          # CGNAT, not "private" in Python
        return False
    return ip.is_global and not (ip.is_private or ip.is_loopback or ip.is_link_local
                                 or ip.is_multicast or ip.is_reserved or ip.is_unspecified)


def _resolve(host: str, port: int, internal_ok: bool) -> str:
    """One lookup; every address checked; the first one returned to connect to."""
    try:
        infos = socket.getaddrinfo(host.strip("[]"), port, type=socket.SOCK_STREAM)
    except (OSError, UnicodeError) as exc:
        raise StorageError(f"could not resolve the host: {type(exc).__name__}") from None
    addresses = []
    for info in infos:
        try:
            addresses.append(ipaddress.ip_address(info[4][0].split("%")[0]))
        except ValueError:
            continue
    if not addresses:
        raise StorageError("the host has no address")
    if not internal_ok and not all(_public(a) for a in addresses):
        raise StorageError("the host resolves to an internal address")
    return str(addresses[0])


def check_url(url: str) -> None:
    """Refuse anything but an http(s) URL to an allowed host (names only;
    addresses are checked when connecting)."""
    _, host, _ = _split(url)
    _policy(host)


def _pinned(url: str) -> tuple[str, dict, dict]:
    """The URL rewritten to the checked address, the Host header, and the TLS
    name to verify: the connection can't be steered by a second DNS answer."""
    parts, host, port = _split(url)
    ip = _resolve(host, port, _policy(host))
    literal = f"[{ip}]" if ":" in ip else ip
    netloc = f"{literal}:{parts.port}" if parts.port else literal
    target = urlunsplit((parts.scheme, netloc, parts.path, parts.query, ""))
    host_header = parts.netloc.rsplit("@", 1)[-1]
    extensions = {"sni_hostname": host.strip("[]")} if parts.scheme == "https" else {}
    return target, {"Host": host_header}, extensions


def _client(timeout: float) -> httpx.Client:
    return httpx.Client(timeout=httpx.Timeout(timeout), follow_redirects=False, trust_env=False,
                        headers={"User-Agent": "dueproof-engine", "Accept-Encoding": "identity"})


def _too_large(limit: int) -> ReadError:
    return ReadError("too_large", f"The file is over the {limit // (1024 * 1024)} MB limit")


def fetch(url: str, max_bytes: int | None = None) -> bytes:
    """The bytes at a signed GET URL. ReadError("too_large") past the cap."""
    limit = max_bytes or config.MAX_SOURCE_BYTES
    timeout = config.FETCH_TIMEOUT
    deadline = time.monotonic() + timeout
    target, headers, extensions = _pinned(url)
    try:
        with _client(timeout) as client, client.stream(
                "GET", target, headers=headers, extensions=extensions) as resp:
            if resp.status_code != 200:
                raise StorageError(f"source GET answered {resp.status_code}")
            encoding = resp.headers.get("content-encoding", "identity").strip().lower()
            if encoding not in ("", "identity"):
                raise StorageError("the source came with a Content-Encoding; only raw bytes are read")
            declared = resp.headers.get("content-length")
            if declared and declared.isdigit() and int(declared) > limit:
                raise _too_large(limit)
            chunks, total = [], 0
            for chunk in resp.iter_raw():  # as received: a chunk size would wait to fill it
                total += len(chunk)
                if total > limit:
                    raise _too_large(limit)
                if time.monotonic() > deadline:
                    raise StorageError("source GET took longer than the timeout")
                chunks.append(chunk)
            return b"".join(chunks)
    except httpx.HTTPError as exc:
        raise StorageError(f"source GET failed: {type(exc).__name__}") from exc


def put(url: str, data: bytes, content_type: str = "image/webp") -> None:
    """PUT bytes to a signed URL. Only the status is read, never the body."""
    timeout = config.PUT_TIMEOUT
    target, headers, extensions = _pinned(url)
    try:
        with _client(timeout) as client, client.stream(
                "PUT", target, content=data, extensions=extensions,
                headers={**headers, "Content-Type": content_type}) as resp:
            status = resp.status_code
    except httpx.HTTPError as exc:
        raise StorageError(f"image PUT failed: {type(exc).__name__}") from exc
    if not 200 <= status < 300:
        raise StorageError(f"image PUT answered {status}")
