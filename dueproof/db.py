"""SQLite schema and the handful of helpers the rest of the app uses."""
from __future__ import annotations

import json
import sqlite3
import threading
from typing import Any, Iterable

from dueproof.config import DB_PATH

_local = threading.local()

# Timestamps are stored in UTC (SQLite's datetime('now')). Calendar decisions —
# "is this overdue today" — are made in config.TZ; see config.today().
SCHEMA = """
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY, filename TEXT NOT NULL, title TEXT, doc_type TEXT,
    languages TEXT,                      -- json array, e.g. ["en"] or ["ml","en"]
    page_count INTEGER DEFAULT 0,
    text_source TEXT,                    -- 'native' | 'ocr' | 'mixed'
    ocr_confidence REAL,
    source_channel TEXT DEFAULT 'Upload', sender TEXT,
    status TEXT DEFAULT 'queued', stage TEXT DEFAULT 'Queued',
    percent INTEGER DEFAULT 0, error TEXT, doc_date TEXT,
    full_text TEXT,                      -- kept so duplicate detection survives restarts
    content_hash TEXT,                   -- sha256 of the uploaded bytes
    received_on TEXT,                    -- the day it arrived; "within N days of receipt" counts from it
    reference TEXT, authority TEXT,      -- what a notice desk files it under
    amount REAL, amount_text TEXT,       -- the sum it demands, in rupees, and as written
    sections TEXT,                       -- json array of provisions cited
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS findings (
    id TEXT PRIMARY KEY, doc_id TEXT NOT NULL,
    kind TEXT NOT NULL,                  -- 'bullet' | 'obligation'
    ord INTEGER DEFAULT 0,
    text_en TEXT, text_local TEXT,       -- one is NULL unless it was translated
    due_date TEXT, severity TEXT,
    roles TEXT,                          -- json array
    evidence_quote TEXT, page_num INTEGER,
    rects_json TEXT,                     -- json [[x0,y0,x1,y1], ...], normalised 0-1
    match_score REAL,
    orig_lang TEXT,                      -- the language the finding was written in
    translated INTEGER DEFAULT 0,
    term_flags TEXT,                     -- json array: terminology the translation may have lost
    section TEXT,                        -- the provision the sentence cites
    tag TEXT,                            -- 'hearing' for an appointment
    due_basis TEXT,                      -- 'receipt:30' when the date runs from receipt
    -- The workflow. What the pipeline found is never overwritten: a person's
    -- correction sits beside it, and every change is in finding_edits.
    status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'done' | 'dismissed'
    assignee TEXT,                       -- a user's email, or free text
    due_override TEXT,                   -- a corrected due date
    roles_override TEXT,                 -- json array: corrected desks
    note TEXT,
    updated_at TEXT, updated_by TEXT
);

CREATE TABLE IF NOT EXISTS finding_edits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    finding_id TEXT NOT NULL,
    at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    actor TEXT, field TEXT NOT NULL, old TEXT, new TEXT
);
CREATE TRIGGER IF NOT EXISTS finding_edits_no_update BEFORE UPDATE ON finding_edits
    BEGIN SELECT RAISE(ABORT, 'edit history is append-only'); END;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT, desk TEXT,                -- desk: the default "viewing as"
    is_admin INTEGER NOT NULL DEFAULT 0,
    pw_hash TEXT,                        -- scrypt; NULL for proxy-only users
    disabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,         -- sha256 of the cookie value; the value is never stored
    user_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS duplicates (
    doc_id TEXT NOT NULL, other_id TEXT NOT NULL, score REAL,
    PRIMARY KEY (doc_id, other_id)
);

-- One row per page: its text for search, its word boxes so a search hit can be
-- outlined on the page exactly as a finding is.
CREATE TABLE IF NOT EXISTS pages (
    doc_id TEXT NOT NULL, page_num INTEGER NOT NULL, text TEXT,
    words TEXT,                          -- json [[text,x0,y0,x1,y1,line_id], ...]
    PRIMARY KEY (doc_id, page_num)
);

-- Each document's MinHash signature, one row per "position:value" key. Two
-- documents are scored for duplication only if they share enough keys.
CREATE TABLE IF NOT EXISTS dup_keys (
    key TEXT NOT NULL, doc_id TEXT NOT NULL, PRIMARY KEY (key, doc_id)
) WITHOUT ROWID;

-- Trigram tokens: substring search in any script, which is what an
-- agglutinative language needs (a stem must find its inflected forms).
CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(
    body, doc_id UNINDEXED, page_num UNINDEXED, finding_id UNINDEXED, tokenize='trigram');

CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    request_id TEXT, actor TEXT, action TEXT NOT NULL, doc_id TEXT, detail TEXT
);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit
    BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit
    BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
"""

INDEXES = """
CREATE INDEX IF NOT EXISTS idx_findings_doc ON findings(doc_id, kind, ord);
CREATE INDEX IF NOT EXISTS idx_findings_due ON findings(due_date);
CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(content_hash);
CREATE INDEX IF NOT EXISTS idx_documents_order ON documents(created_at);
CREATE INDEX IF NOT EXISTS idx_dup_keys_doc ON dup_keys(doc_id);
CREATE INDEX IF NOT EXISTS idx_audit_doc ON audit(doc_id);
CREATE INDEX IF NOT EXISTS idx_findings_status ON findings(status);
CREATE INDEX IF NOT EXISTS idx_finding_edits ON finding_edits(finding_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
"""

class _Handle:
    """Owns one connection and closes it when its thread ends — thread-local
    storage is torn down with the thread, which is what triggers __del__."""
    def __init__(self) -> None:
        self.c = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=30)
        self.c.row_factory = sqlite3.Row
        # Safe under WAL (a crash can lose the last commit, never corrupt the
        # file) and it removes an fsync from every stage update.
        self.c.execute("PRAGMA synchronous=NORMAL")

    def __del__(self) -> None:
        self.c.close()

def conn() -> sqlite3.Connection:
    """One connection per thread — the workers and the API run on different ones."""
    h = getattr(_local, "handle", None)
    if h is None:
        h = _local.handle = _Handle()
    return h.c

def close() -> None:
    """Release this thread's connection now rather than when the thread ends."""
    _local.handle = None

def init() -> None:
    c = conn()
    c.executescript(SCHEMA)
    c.executescript(INDEXES)
    c.commit()

def q(sql: str, args: Iterable[Any] = ()) -> list[dict]:
    return [dict(r) for r in conn().execute(sql, tuple(args)).fetchall()]

def one(sql: str, args: Iterable[Any] = ()) -> dict | None:
    r = conn().execute(sql, tuple(args)).fetchone()
    return dict(r) if r else None

def run(sql: str, args: Iterable[Any] = ()) -> None:
    conn().execute(sql, tuple(args))
    conn().commit()

def runmany(sql: str, rows: Iterable[Iterable[Any]]) -> None:
    conn().executemany(sql, rows)
    conn().commit()

def set_stage(doc_id: str, stage: str, percent: int) -> None:
    run("UPDATE documents SET stage=?, percent=? WHERE id=?", (stage, percent, doc_id))

def forget(doc_id: str) -> None:
    """Drop everything derived from a document, keeping its row."""
    for sql in ("DELETE FROM findings WHERE doc_id=?", "DELETE FROM pages WHERE doc_id=?",
                "DELETE FROM search WHERE doc_id=?", "DELETE FROM dup_keys WHERE doc_id=?",
                "DELETE FROM duplicates WHERE doc_id=? OR other_id=?"):
        conn().execute(sql, (doc_id,) * sql.count("?"))
    conn().commit()

def jload(v: str | None) -> Any:
    try:
        return json.loads(v) if v else []
    except (ValueError, TypeError):
        return []
