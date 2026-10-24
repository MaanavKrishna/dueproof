"""Regenerate tests/golden.json. Run this only when a change to the findings is
deliberate, and read the diff before keeping it:

    python -m tests.make_golden
"""
import json

from tests.support import GOLDEN, snapshot

if __name__ == "__main__":
    snap = {name: {k: v for k, v in doc.items() if k != "full_text"}
            for name, doc in snapshot().items()}
    GOLDEN.write_text(json.dumps(snap, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{GOLDEN.name}: {len(snap)} documents,"
          f" {sum(len(d['findings']) for d in snap.values())} findings")
