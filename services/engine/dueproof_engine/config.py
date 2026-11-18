"""Limits and engine settings. The words Dueproof looks for live in profiles/.

The engine is stateless: it writes nothing to disk except, optionally, model
files it was told to cache. Every setting is an environment variable read once
at start-up, so a container can run with a read-only root filesystem.
"""
from __future__ import annotations

import functools
import os
import shutil
import subprocess
from pathlib import Path

from dueproof_engine import profiles
from dueproof_engine.languages import enabled

PRODUCT = "Dueproof"
ROOT = Path(__file__).resolve().parent          # the package directory
ENGINE_ROOT = ROOT.parent                       # services/engine
MODELS = Path(os.environ.get("DUEPROOF_MODELS") or ENGINE_ROOT / "models").resolve()

def _int(name: str, default: int) -> int:
    return int(os.environ.get(name) or default)

def _float(name: str, default: float) -> float:
    return float(os.environ.get(name) or default)

# --- Resource caps ---------------------------------------------------------
# A source larger than this is refused before it is parsed ("too_large").
MAX_SOURCE_BYTES = _int("DUEPROOF_MAX_SOURCE_BYTES", 80 * 1024 * 1024)
MAX_PAGES = _int("DUEPROOF_MAX_PAGES", 300)       # a longer PDF is refused, not half-processed
MAX_PAGE_PIXELS = _int("DUEPROOF_MAX_PAGE_PIXELS", 40_000_000)   # renders at a lower DPI instead
# An image whose header claims more pixels than this is refused before it is
# decoded (Pillow's decompression-bomb guard is set to the same number).
MAX_IMAGE_PIXELS = _int("DUEPROOF_MAX_IMAGE_PIXELS", 120_000_000)
FETCH_TIMEOUT = _float("DUEPROOF_FETCH_TIMEOUT", 30.0)            # seconds, per request
PUT_TIMEOUT = _float("DUEPROOF_PUT_TIMEOUT", 30.0)

# --- Languages -------------------------------------------------------------
# English is always read. DUEPROOF_LANGUAGES (or the profile's LANGUAGES) adds
# any of the languages in languages.py: "hi,ta", or "all". This decides which
# scripts analysis recognises; read's language hints decide OCR packs.
LOCALS = enabled([c.strip() for c in (os.environ.get("DUEPROOF_LANGUAGES")
                                      or ",".join(profiles.LANGUAGES)).split(",") if c.strip()])
# Character-class body covering every enabled script; "" when English only.
LOCAL_SCRIPTS = "".join(dict.fromkeys(lang["script"] for lang in LOCALS))

# --- OCR -------------------------------------------------------------------
# The ladder (design record 03 §6a): text layer, then
# PaddleOCR on ONNX Runtime, then Tesseract. A page whose best reading is
# below the bar is reported in needsEscalation.
OCR_CONFIDENCE_BAR = _float("DUEPROOF_OCR_CONFIDENCE_BAR", 0.85)
PADDLE_MODEL_DIR = Path(os.environ.get("DUEPROOF_PADDLE_MODELS") or MODELS / "ppocr")
TESSERACT_CMD = (os.environ.get("DUEPROOF_TESSERACT") or shutil.which("tesseract")
                 or shutil.which("tesseract", path="/opt/homebrew/bin:/usr/local/bin")
                 or "tesseract")

@functools.cache
def installed_packs() -> frozenset[str]:
    """Tesseract's installed language packs; empty when Tesseract is absent.
    Asked once, lazily: a subprocess at import would slow every cold start."""
    try:
        out = subprocess.run([TESSERACT_CMD, "--list-langs"], capture_output=True, text=True,
                             timeout=20).stdout
        return frozenset(out.split()[1:]) if out else frozenset()
    except (OSError, subprocess.SubprocessError):
        return frozenset()

def tesseract_langs(hints: list[str] | None = None) -> str:
    """The "+"-joined packs for these language hints (default: the enabled
    languages), installed ones only — asking for a missing pack fails the page."""
    from dueproof_engine.languages import LANGUAGES
    codes = hints if hints is not None else [lang["code"] for lang in LOCALS]
    packs = [LANGUAGES[c]["ocr"] for c in codes if c in LANGUAGES and LANGUAGES[c]["ocr"]]
    return "+".join([p for p in dict.fromkeys(packs) if p in installed_packs()] + ["eng"])

OCR_DPI = 300        # what Tesseract sees
PADDLE_DPI = 200     # what PaddleOCR sees: its detector is trained near this scale
DISPLAY_DPI = 144    # what the browser sees
DISPLAY_QUALITY = 80 # WebP quality of the page images

# --- Local language -> English machine translation (engine-heavy) ----------
# IndicTrans2 (AI4Bharat; weights under the MIT licence per the model card,
# vendored model code under Apache-2.0: see NOTICE) translates all 22
# languages in languages.py into English. It runs locally and is offline by construction:
#   * the model's Python is vendored in pipeline/indictrans2/, byte-identical to
#     the pinned revision, so nothing is fetched and executed (no
#     trust_remote_code);
#   * the weights load from a local directory only, and every file is checked
#     against the SHA-256 below before it is opened;
#   * the Hugging Face libraries are told they are offline, so a missing file is
#     an error, never a download.
# The single place the network is touched is `python -m dueproof_engine.tools.model`,
# run once by hand on a connected machine. Without weights (or without torch,
# as in engine-fast) /v1/translate answers engine "none". DUEPROOF_TRANSLATE=0 skips it.
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
MT_ENABLED = os.environ.get("DUEPROOF_TRANSLATE", "1") != "0"
MT_MODEL = "ai4bharat/indictrans2-indic-en-dist-200M"
MT_REVISION = "eb9e49d81077cfc5311e82ff36d8c1fc11557b5d"
# Where the weights live: DUEPROOF_MT_DIR, else <models>/indictrans2 (the
# air-gapped layout), else the Hugging Face cache at MT_REVISION.
MT_DIR = Path(os.environ.get("DUEPROOF_MT_DIR") or MODELS / "indictrans2")
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
