"""Back up and restore everything Dueproof holds: the database, the uploaded
originals and the rendered page images.

    dueproof backup  /mnt/backups        -> /mnt/backups/dueproof-20261003-141500/
    dueproof verify  /mnt/backups/dueproof-20261003-141500
    dueproof restore /mnt/backups/dueproof-20261003-141500

`backup` is safe while the app is running: the database is copied with SQLite's
online backup API, which yields a consistent snapshot under concurrent writes.
`verify` is what makes it a backup rather than a copy — it opens the snapshot,
runs an integrity check, and confirms every document's original still hashes to
what was recorded at ingest and every page image is present. `restore` verifies
first and refuses to overwrite an existing database unless told to.
"""
from __future__ import annotations

import hashlib
import shutil
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

from dueproof.config import DATA, DB_PATH, PAGES, UPLOADS

def backup(dest_root: Path) -> Path:
    dest = Path(dest_root) / f"dueproof-{datetime.now(timezone.utc):%Y%m%d-%H%M%S}"
    dest.mkdir(parents=True)
    src, out = sqlite3.connect(DB_PATH), sqlite3.connect(dest / DB_PATH.name)
    try:
        src.backup(out)
    finally:
        src.close()
        out.close()
    for folder in (UPLOADS, PAGES):
        shutil.copytree(folder, dest / folder.name,
                        ignore=shutil.ignore_patterns("tmp-*"))     # uploads still arriving
    return dest

def verify(folder: Path) -> list[str]:
    """Everything wrong with a backup; an empty list means it will restore."""
    folder = Path(folder)
    if not (folder / DB_PATH.name).is_file():
        return [f"{DB_PATH.name} is missing"]
    problems = []
    db = sqlite3.connect(f"file:{folder / DB_PATH.name}?mode=ro", uri=True)
    try:
        if (state := db.execute("PRAGMA integrity_check").fetchone()[0]) != "ok":
            problems.append(f"database integrity: {state}")
        for doc_id, digest, pages in db.execute(
                "SELECT id, content_hash, page_count FROM documents WHERE status='done'"):
            original = next(iter(sorted((folder / UPLOADS.name).glob(f"{doc_id}.*"))), None)
            if original is None:
                problems.append(f"{doc_id}: original missing")
            elif digest and hashlib.sha256(original.read_bytes()).hexdigest() != digest:
                problems.append(f"{doc_id}: original does not match its recorded hash")
            missing = [n for n in range(1, (pages or 0) + 1)
                       if not (folder / PAGES.name / doc_id / f"{n}.jpg").is_file()]
            if missing:
                problems.append(f"{doc_id}: page image(s) missing: {missing}")
    finally:
        db.close()
    return problems

def restore(folder: Path, data: Path = DATA, force: bool = False) -> None:
    folder, data = Path(folder), Path(data)
    if problems := verify(folder):
        raise SystemExit("refusing to restore a damaged backup:\n  " + "\n  ".join(problems))
    target = data / DB_PATH.name
    if target.exists() and not force:
        raise SystemExit(f"{target} exists; stop the app and pass --force to replace it")
    data.mkdir(parents=True, exist_ok=True)
    for stale in (target, Path(f"{target}-wal"), Path(f"{target}-shm")):
        stale.unlink(missing_ok=True)       # a WAL from the old database must not be replayed
    shutil.copyfile(folder / DB_PATH.name, target)
    for name in (UPLOADS.name, PAGES.name):
        shutil.rmtree(data / name, ignore_errors=True)
        shutil.copytree(folder / name, data / name)

def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[0] not in ("backup", "verify", "restore"):
        print(__doc__)
        return 2
    if argv[0] == "backup":
        dest = backup(Path(argv[1]))
        problems = verify(dest)
        print(dest if not problems else "backup written but FAILED verification:\n  "
              + "\n  ".join(problems))
        return 1 if problems else 0
    if argv[0] == "verify":
        problems = verify(Path(argv[1]))
        print("ok" if not problems else "\n".join(problems))
        return 1 if problems else 0
    restore(Path(argv[1]), force="--force" in argv)
    print(f"restored into {DATA}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
