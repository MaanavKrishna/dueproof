"""Accounts, sessions and the sign-in checks.

Passwords are hashed with scrypt (stdlib). A session is a random token in an
HttpOnly, SameSite=Strict cookie; only its SHA-256 is stored, so a stolen
database does not yield live sessions. State-changing API calls must carry an
`X-Dueproof` header: a browser will not add a custom header to a cross-site
request without a CORS preflight, which Dueproof never grants — that is the
CSRF defence, and it costs the frontend one header.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone

from dueproof import db
from dueproof.config import AUTH, AUTH_HEADER, SESSION_DAYS

COOKIE = "dueproof_session"
CSRF_HEADER = "X-Dueproof"
UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}
# Reachable without signing in: the sign-in itself, and what the sign-in page
# needs to draw itself.
PUBLIC = {"/api/login", "/api/meta", "/api/version", "/api/me"}

_SCRYPT = {"n": 2 ** 14, "r": 8, "p": 1}

def hash_password(password: str) -> str:
    if len(password) < 10:
        raise ValueError("Passwords need at least 10 characters")
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, dklen=32, **_SCRYPT)
    return f"scrypt${_SCRYPT['n']}${_SCRYPT['r']}${_SCRYPT['p']}${salt.hex()}${digest.hex()}"

def check_password(password: str, stored: str | None) -> bool:
    try:
        _, n, r, p, salt, digest = (stored or "").split("$")
        got = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), dklen=32,
                             n=int(n), r=int(r), p=int(p))
        return hmac.compare_digest(got.hex(), digest)
    except (ValueError, TypeError):
        return False

# users
def add_user(email: str, name: str = "", desk: str = "", password: str | None = None,
             admin: bool = False) -> int:
    email = email.strip().lower()
    if "@" not in email or len(email) > 254:
        raise ValueError(f"{email!r} is not an email address")
    pw = hash_password(password) if password is not None else None
    db.run("INSERT INTO users (email, name, desk, is_admin, pw_hash) VALUES (?,?,?,?,?)",
           (email, name or email.split("@")[0], desk or None, int(admin), pw))
    return db.one("SELECT id FROM users WHERE email=?", (email,))["id"]

def set_password(email: str, password: str) -> None:
    user = db.one("SELECT id FROM users WHERE email=?", (email.strip(),))
    if not user:
        raise ValueError(f"No user {email}")
    db.run("UPDATE users SET pw_hash=? WHERE id=?", (hash_password(password), user["id"]))
    db.run("DELETE FROM sessions WHERE user_id=?", (user["id"],))   # sign out everywhere

def set_disabled(email: str, disabled: bool) -> None:
    user = db.one("SELECT id FROM users WHERE email=?", (email.strip(),))
    if not user:
        raise ValueError(f"No user {email}")
    db.run("UPDATE users SET disabled=? WHERE id=?", (int(disabled), user["id"]))
    if disabled:
        db.run("DELETE FROM sessions WHERE user_id=?", (user["id"],))

def public_user(u: dict) -> dict:
    return {"email": u["email"], "name": u["name"], "desk": u["desk"],
            "is_admin": bool(u["is_admin"])}

# sessions
def _now() -> datetime:
    return datetime.now(timezone.utc)

def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

def start_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    expires = (_now() + timedelta(days=SESSION_DAYS)).strftime("%Y-%m-%d %H:%M:%S")
    db.run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)",
           (_token_hash(token), user_id, expires))
    db.run("DELETE FROM sessions WHERE expires_at < datetime('now')")   # housekeeping
    return token

def end_session(token: str | None) -> None:
    if token:
        db.run("DELETE FROM sessions WHERE token_hash=?", (_token_hash(token),))

def session_user(token: str | None) -> dict | None:
    if not token:
        return None
    return db.one("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id"
                  " WHERE s.token_hash=? AND s.expires_at > datetime('now') AND u.disabled=0",
                  (_token_hash(token),))

# brute-force brake: per (email, client), in memory
_FAILS: dict[tuple[str, str], list[float]] = {}
_FAILS_LOCK = threading.Lock()
MAX_FAILS, WINDOW = 5, 600.0

def login_blocked(email: str, client: str) -> bool:
    with _FAILS_LOCK:
        recent = [t for t in _FAILS.get((email.lower(), client), []) if time.time() - t < WINDOW]
        _FAILS[(email.lower(), client)] = recent
        return len(recent) >= MAX_FAILS

def login_failed(email: str, client: str) -> None:
    with _FAILS_LOCK:
        _FAILS.setdefault((email.lower(), client), []).append(time.time())

def login_succeeded(email: str, client: str) -> None:
    with _FAILS_LOCK:
        _FAILS.pop((email.lower(), client), None)

def authenticate(email: str, password: str) -> dict | None:
    user = db.one("SELECT * FROM users WHERE email=? AND disabled=0", (email.strip(),))
    # Hash even for an unknown address, so timing does not reveal which exist.
    ok = check_password(password, user["pw_hash"] if user else
                        "scrypt$16384$8$1$00$00")
    return user if user and ok else None

# the request check
def identify(request) -> tuple[dict | None, str | None]:
    """Who is making this request, and if they may not, why not.
    Returns (user, refusal); a user of None with no refusal means auth is off."""
    if AUTH == "none":
        return None, None
    if AUTH == "proxy":
        email = (request.headers.get(AUTH_HEADER) or "").strip()
        if not email:
            return None, "Not signed in"
        user = db.one("SELECT * FROM users WHERE email=?", (email,))
        if user and user["disabled"]:
            return None, "This account is disabled"
        return user or {"email": email, "name": email, "desk": None, "is_admin": 0}, None
    user = session_user(request.cookies.get(COOKIE))
    return (user, None) if user else (None, "Not signed in")
