"""Provision the translation weights. The ONLY code in Dueproof that touches the
network, and it is never run by the app — run it once, by hand, on a connected
machine, then carry models/indictrans2/ to the server.

    dueproof fetch-model

It downloads data files only (weights, vocabularies, JSON config) at the pinned
revision — never Python — and checks every file against the SHA-256 in
config.py. The model is licence-gated: accept the licence on the model page and
run `hf auth login` first.
"""
from __future__ import annotations

import os

from dueproof.config import MT_DIR, MT_FILES, MT_MODEL, MT_REVISION
from dueproof.pipeline.translate import verify

def main() -> int:
    # The one place the network is allowed; must be set before the import.
    os.environ["HF_HUB_OFFLINE"] = "0"
    from huggingface_hub import snapshot_download
    MT_DIR.mkdir(parents=True, exist_ok=True)
    snapshot_download(MT_MODEL, revision=MT_REVISION, local_dir=MT_DIR,
                      allow_patterns=sorted(MT_FILES))
    verify(MT_DIR)
    print(f"{MT_MODEL}@{MT_REVISION[:8]} verified in {MT_DIR}")
    return 0

