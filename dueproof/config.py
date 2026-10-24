"""Paths, limits and engine settings. The words Dueproof looks for live in profiles/."""
from __future__ import annotations

import os
import shutil
import subprocess
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from dueproof import profiles
from dueproof.languages import enabled

PRODUCT = "Dueproof"
ROOT = Path(__file__).resolve().parent         # the package directory
# Everything the app writes lives under DUEPROOF_DATA, by default ./data in the
# directory Dueproof is started from (the test suite points it at a temp dir
# at a temp directory).
DATA = Path(os.environ.get("DUEPROOF_DATA") or Path.cwd() / "data").resolve()
UPLOADS, PAGES = DATA / "uploads", DATA / "pages"
INBOX = DATA / "inbox"          # watched folder; POST /api/inbox/scan pulls from it
DB_PATH = DATA / "dueproof.db"
STATIC = ROOT / "static"
for _d in (UPLOADS, PAGES, INBOX):
    _d.mkdir(parents=True, exist_ok=True)

ORG_NAME = os.environ.get("DUEPROOF_ORG", profiles.ORG_NAME)
CHANNELS = profiles.CHANNELS

# --- Identity --------------------------------------------------------------
# DUEPROOF_AUTH chooses how people sign in:
#   local  (default) accounts kept by Dueproof; add them with `dueproof users add`
#   proxy  a reverse proxy in front does the login (oauth2-proxy, an SSO
#          gateway) and passes the user in DUEPROOF_AUTH_HEADER
#   none   no sign-in at all — for a laptop, never for a network
AUTH = os.environ.get("DUEPROOF_AUTH", "local").lower()
if AUTH not in ("local", "proxy", "none"):
    raise SystemExit(f"DUEPROOF_AUTH={AUTH!r}: use local, proxy or none")
AUTH_HEADER = os.environ.get("DUEPROOF_AUTH_HEADER", "X-Forwarded-User" if AUTH == "proxy" else "")
SESSION_DAYS = int(os.environ.get("DUEPROOF_SESSION_DAYS", "7"))
# Mark the session cookie Secure. Leave on unless you serve plain HTTP on a
# trusted network (or localhost, which browsers treat as secure anyway).
SECURE_COOKIES = os.environ.get("DUEPROOF_SECURE_COOKIES", "1") != "0"

# --- The clock -------------------------------------------------------------
# Every calendar decision — "due today", "overdue" — is made in the
# organisation's timezone, whatever the server is set to. On a UTC host serving
# an office five hours east, date.today() turns a deadline overdue five hours late.
TZ = ZoneInfo(os.environ.get("DUEPROOF_TZ") or profiles.TIMEZONE)

def today(now: datetime | None = None) -> date:
    return (now or datetime.now(TZ)).astimezone(TZ).date()

# --- Resource caps ---------------------------------------------------------
MAX_UPLOAD_BYTES = 80 * 1024 * 1024
MAX_PAGES = 300                 # a longer PDF is refused, not half-processed
MAX_PAGE_PIXELS = 40_000_000    # a poster-sized page renders at a lower DPI instead

# --- Languages -------------------------------------------------------------
# English is always read. DUEPROOF_LANGUAGES (or the profile's LANGUAGES) adds
# any of the languages in languages.py: "hi,ta", or "all".
LOCALS = enabled([c.strip() for c in (os.environ.get("DUEPROOF_LANGUAGES")
                                      or ",".join(profiles.LANGUAGES)).split(",") if c.strip()])
# Character-class body covering every enabled script; "" when English only.
LOCAL_SCRIPTS = "".join(dict.fromkeys(lang["script"] for lang in LOCALS))

# --- OCR -------------------------------------------------------------------
TESSERACT_CMD = (os.environ.get("DUEPROOF_TESSERACT") or shutil.which("tesseract")
                 or shutil.which("tesseract", path="/opt/homebrew/bin:/usr/local/bin")
                 or "tesseract")

def _installed_packs() -> set[str]:
    try:
        out = subprocess.run([TESSERACT_CMD, "--list-langs"], capture_output=True, text=True,
                             timeout=20).stdout
        return set(out.split()[1:]) if out else set()
    except (OSError, subprocess.SubprocessError):
        return set()

# Only packs that are actually installed: asking Tesseract for a missing one
# fails the whole page. A language without its pack is still read from PDFs
# that carry a text layer.
_PACKS = _installed_packs()
OCR_LANGS = "+".join([lang["ocr"] for lang in LOCALS if lang["ocr"] in _PACKS] + ["eng"])
OCR_DPI = 300        # what Tesseract sees
DISPLAY_DPI = 144    # what the browser sees
DISPLAY_QUALITY = 82

# --- Local language -> English machine translation -------------------------
# IndicTrans2 (AI4Bharat, MIT licence) translates all 22 languages in
# languages.py into English. It runs locally and is offline by construction:
#   * the model's Python is vendored in pipeline/indictrans2/, byte-identical to
#     the pinned revision, so nothing is fetched and executed (no
#     trust_remote_code);
#   * the weights load from a local directory only, and every file is checked
#     against the SHA-256 below before it is opened;
#   * the Hugging Face libraries are told they are offline, so a missing file is
#     an error, never a download.
# The single place the network is touched is scripts/fetch_model.py, run once by
# hand on a connected machine. Without weights the app still runs and findings
# stay in the language they were written in. DUEPROOF_TRANSLATE=0 skips it.
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
MT_ENABLED = bool(LOCALS) and os.environ.get("DUEPROOF_TRANSLATE", "1") != "0"
MT_MODEL = "ai4bharat/indictrans2-indic-en-dist-200M"
MT_REVISION = "eb9e49d81077cfc5311e82ff36d8c1fc11557b5d"
# Where the weights live: DUEPROOF_MT_DIR, else <data>/models/indictrans2 (the
# air-gapped layout), else the Hugging Face cache at MT_REVISION.
MT_DIR = Path(os.environ.get("DUEPROOF_MT_DIR") or DATA / "models" / "indictrans2")
MT_FILES = {
    "config.json": "7268e8cc0fb12d2791d5380595eb44039d03a2066c995f99a1bcc9da8d1100a6",
    "dict.SRC.json": "3d3b180702520742dec423a5a7f7b4e3dad399d69e40ca7df294a1567884bed5",
    "dict.TGT.json": "13c3a162fe655dbe99c790a413675c5d0634cd771fadcefe8d407676a7d1a311",
    "generation_config.json": "6c8b29ae72e680d5a2d9e849567f6f556d3f4e9bbd42434964a646f49b556972",
    "model.SRC": "ac9257c8e76b8b607705b959cc3d075656ea33032f7a974e467b8941df6e98d4",
    "model.TGT": "3cedc5cbcc740369b76201942a0f096fec7287fee039b55bdb956f301235b914",
    "model.safetensors": "a9bff20ae94712db41c8dc99d2e381eb456ddccbcd48cb2c7cf077ccc5bc58d8",
    "tokenizer_config.json": "b0c7ac8aeb57d54d079494ce726563cc37398e698086104bd06b5aa5b69a775d",
}
MT_TGT, MT_BATCH, MT_MAX_TOKENS = "eng_Latn", 8, 256
# Sentences per document translated *before* analysis, so the English rules can
# read them. Beyond this, a document's remaining sentences are judged on the
# profile's own-language vocabulary alone.
MT_MAX_SENTENCES = 200
