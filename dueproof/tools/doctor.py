"""`dueproof doctor`: check an installation before trusting it."""
from __future__ import annotations

import os
import shutil
import subprocess
import sys

from dueproof import __version__, db
from dueproof.config import (AUTH, DATA, LOCALS, MT_ENABLED, OCR_LANGS, SECURE_COOKIES,
                             TESSERACT_CMD, TZ)
from dueproof.profiles import NAME as PROFILE

def checks() -> list[tuple[str, bool | None, str]]:
    """(what, ok, detail). ok is None for a warning that does not fail the run."""
    out: list[tuple[str, bool | None, str]] = []
    out.append(("Python", sys.version_info >= (3, 12), sys.version.split()[0]))
    out.append(("Dueproof", True, f"{__version__}, profile {PROFILE}, timezone {TZ}"))
    try:
        v = subprocess.run([TESSERACT_CMD, "--version"], capture_output=True, text=True,
                           timeout=20).stdout.split("\n")[0]
        out.append(("Tesseract", bool(v), v or "not runnable"))
    except OSError:
        out.append(("Tesseract", False, f"{TESSERACT_CMD} not found — scans and photos cannot be read"))
    packs = OCR_LANGS.split("+")
    for lang in LOCALS:
        if not lang["ocr"]:
            out.append((f"OCR for {lang['english']}", None,
                        "Tesseract has no pack: only PDFs with a text layer can be read"))
        else:
            out.append((f"OCR for {lang['english']}", lang["ocr"] in packs,
                        "installed" if lang["ocr"] in packs else
                        f"missing — install the '{lang['ocr']}' Tesseract pack"))
    if MT_ENABLED:
        from dueproof.pipeline import translate
        try:
            folder = translate.model_dir()
            translate.verify(folder)
            out.append(("Translation weights", True, f"verified in {folder}"))
        except translate.ModelUnavailable as exc:
            out.append(("Translation weights", None,
                        f"{exc} — {', '.join(l['english'] for l in LOCALS)} will be read "
                        "only through the profile's own vocabulary"))
    try:
        DATA.mkdir(parents=True, exist_ok=True)
        probe = DATA / ".write-test"
        probe.write_text("ok")
        probe.unlink()
        free = shutil.disk_usage(DATA).free / 2**30
        out.append(("Data folder", True, f"{DATA} ({free:.1f} GB free)"))
        if free < 2:
            out.append(("Disk space", None, "under 2 GB free"))
    except OSError as exc:
        out.append(("Data folder", False, f"{DATA}: {exc}"))
    try:
        db.init()
        users = db.one("SELECT COUNT(*) n FROM users WHERE disabled=0")["n"]
        docs = db.one("SELECT COUNT(*) n FROM documents")["n"]
        out.append(("Database", True, f"{docs} document(s), {users} active account(s)"))
    except Exception as exc:                            # noqa: BLE001
        users = 0
        out.append(("Database", False, str(exc)))
    if AUTH == "none":
        out.append(("Sign-in", None, "DUEPROOF_AUTH=none: anyone who can reach the port sees everything"))
    elif AUTH == "local":
        out.append(("Sign-in", bool(users), "local accounts" if users else
                    "no accounts yet — run: dueproof users add you@example.org --admin"))
    else:
        out.append(("Sign-in", True, f"by the proxy in front, header {os.environ.get('DUEPROOF_AUTH_HEADER', 'X-Forwarded-User')}"))
    if AUTH == "local" and not SECURE_COOKIES:
        out.append(("Cookies", None, "DUEPROOF_SECURE_COOKIES=0: only safe on localhost or a trusted network"))
    return out

def main() -> int:
    failed = 0
    for what, ok, detail in checks():
        mark = "ok  " if ok else "WARN" if ok is None else "FAIL"
        failed += ok is False
        print(f"[{mark}] {what:<26} {detail}")
    print("\nAll checks passed." if not failed else f"\n{failed} check(s) failed.")
    return 1 if failed else 0
