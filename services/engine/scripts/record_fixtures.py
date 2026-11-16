"""Record the engine's responses over the test PDFs, for the TypeScript lanes
to build against without running the engine:

    uv run python scripts/record_fixtures.py

Writes fixtures/recorded/<fixture>.<endpoint>.json for inspect, read, analyze
and link, by calling the real HTTP app (in-process) with sources served from
tests/fixtures by a local stand-in for signed-URL storage. The read is made as
engine-fast would make it (maxRung "paddleocr"), the analysis with the default
profile (notices_in) and receivedOn 2026-10-24; link is asked for every
finding's quote. Re-run after any change that alters engine output, and
review the diff.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ENGINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ENGINE))
os.environ.setdefault("ENGINE_SHARED_SECRET", "record-fixtures-" + "r" * 32)
os.environ.setdefault("DUEPROOF_LOG_LEVEL", "WARNING")
os.environ["DUEPROOF_PROFILE"] = "notices_in"

from fastapi.testclient import TestClient  # noqa: E402

from dueproof_engine.api.auth import make_token  # noqa: E402
from dueproof_engine.app import app  # noqa: E402
from tests.fixtures import FOLDER  # noqa: E402
from tests.storage_server import StorageServer  # noqa: E402

OUT = ENGINE / "fixtures" / "recorded"
RECEIVED_ON = "2026-10-24"


def _write(name: str, endpoint: str, body: dict) -> None:
    path = OUT / f"{Path(name).stem}.{endpoint}.json"
    path.write_text(json.dumps(body, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"  {path.relative_to(ENGINE)}")


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    client = TestClient(app, headers={"Authorization": "Bearer " + make_token(
        os.environ["ENGINE_SHARED_SECRET"], 900)})
    pdfs = sorted(p.name for p in FOLDER.glob("*.pdf"))
    with StorageServer(FOLDER) as storage:
        for name in pdfs:
            print(name)
            got = client.post("/v1/inspect", json={"sourceUrl": storage.url(name),
                                                   "mime": "application/pdf"})
            got.raise_for_status()
            inspect = got.json()
            _write(name, "inspect", inspect)
            if not inspect["ok"]:
                continue
            urls = [storage.url(f"pages/{Path(name).stem}/{n}.webp")
                    for n in range(1, inspect["pageCount"] + 1)]
            got = client.post("/v1/read", json={"sourceUrl": storage.url(name),
                                                "mime": "application/pdf", "pageImagePutUrls": urls,
                                                "languages": ["en", "hi", "ml"],
                                                "maxRung": "paddleocr"})
            got.raise_for_status()
            read = got.json()
            _write(name, "read", read)
            got = client.post("/v1/analyze", json={"pages": read["pages"], "receivedOn": RECEIVED_ON})
            got.raise_for_status()
            analyze = got.json()
            _write(name, "analyze", analyze)
            quotes = [{"id": f"f{i}", "text": f["quote"], **({"pageHint": f["pageHint"]}
                                                             if "pageHint" in f else {})}
                      for i, f in enumerate(analyze["findings"])]
            got = client.post("/v1/link", json={"pages": read["pages"], "quotes": quotes})
            got.raise_for_status()
            _write(name, "link", got.json())
    return 0


if __name__ == "__main__":
    sys.exit(main())
