"""Step 2 (optional) — any of the 22 Indian languages to English, running locally.

IndicTrans2 (AI4Bharat, IIT Madras) is a ~200M translation model, not a
language model: no prompts, no API. It is offline by construction rather than
by configuration — the model code is vendored in pipeline/indictrans2/, the
weights are read from a local directory and hash-checked, and nothing here can
download anything. Everything degrades quietly: without the weights, findings
stay in the language they were written in and the UI labels them as such.
"""
from __future__ import annotations

import hashlib
import logging
import re
import threading
from pathlib import Path

from dueproof.config import (MT_BATCH, MT_DIR, MT_ENABLED, MT_FILES, MT_MAX_TOKENS, MT_MODEL,
                    MT_REVISION, MT_TGT)
from dueproof.languages import LANGUAGES
from dueproof.profiles import LATIN_TERMS, TERMS

log = logging.getLogger("dueproof.translate")
_lock = threading.Lock()
# One translation at a time. IndicProcessor keeps per-call state in an internal
# queue and is not thread-safe: two workers inside it at once block forever.
_translating = threading.Lock()
_state: dict = {"loaded": False, "ok": False}

class ModelUnavailable(RuntimeError):
    pass

def model_dir() -> Path:
    """The local directory holding the weights. Never downloads."""
    if MT_DIR.is_dir():
        return MT_DIR
    from huggingface_hub import snapshot_download
    try:
        return Path(snapshot_download(MT_MODEL, revision=MT_REVISION, local_files_only=True))
    except Exception as exc:                # noqa: BLE001 — any miss means "not provisioned"
        raise ModelUnavailable("weights not found; run scripts/fetch_model.py once"
                               " on a connected machine") from exc

def verify(folder: Path) -> None:
    """Refuse weights that are not the reviewed ones."""
    for name, want in MT_FILES.items():
        path = folder / name
        if not path.is_file():
            raise ModelUnavailable(f"{name} is missing from {folder}")
        digest = hashlib.sha256()
        with path.open("rb") as fh:
            while chunk := fh.read(1 << 22):
                digest.update(chunk)
        if digest.hexdigest() != want:
            raise ModelUnavailable(f"{name} does not match the pinned SHA-256; refusing to load")

def _load() -> bool:
    """Load the model once, on first use. False when unavailable."""
    if _state["loaded"]:
        return _state["ok"]
    with _lock:
        if _state["loaded"]:
            return _state["ok"]
        try:
            folder = model_dir()
            verify(folder)
            import torch
            from IndicTransToolkit.processor import IndicProcessor
            from dueproof.pipeline.indictrans2.modeling_indictrans import IndicTransForConditionalGeneration
            from dueproof.pipeline.indictrans2.tokenization_indictrans import IndicTransTokenizer
            model = IndicTransForConditionalGeneration.from_pretrained(folder, local_files_only=True)
            model.eval()
            _state.update(ok=True, torch=torch, model=model,
                          tok=IndicTransTokenizer.from_pretrained(folder, local_files_only=True),
                          proc=IndicProcessor(inference=True))
            log.info("%s@%s ready", MT_MODEL, MT_REVISION[:8])
        except Exception as exc:            # noqa: BLE001 — never break a document
            log.warning("translation unavailable, findings stay in their source language — %s",
                        (str(exc).splitlines() or [type(exc).__name__])[0][:200])
        finally:
            _state["loaded"] = True
    return _state["ok"]

def warm() -> None:
    """Preload in the background so the first upload of the day isn't slow."""
    if MT_ENABLED:
        threading.Thread(target=_load, daemon=True).start()

def translate(items: list[tuple[str, str]]) -> list[str | None]:
    """[(language code, text)] -> English, in order; None where it failed."""
    torch, tok, model, proc = _state["torch"], _state["tok"], _state["model"], _state["proc"]
    out: list[str | None] = [None] * len(items)
    by_lang: dict[str, list[int]] = {}
    for n, (code, _) in enumerate(items):
        by_lang.setdefault(code, []).append(n)
    for code, indices in by_lang.items():           # a batch must share one source language
        if code not in LANGUAGES:
            continue
        for i in range(0, len(indices), MT_BATCH):
            chunk = indices[i:i + MT_BATCH]
            try:
                for n, text in zip(chunk, _translate_batch(
                        [items[n][1] for n in chunk], LANGUAGES[code]["mt"],
                        torch, tok, model, proc)):
                    out[n] = text
            except Exception:               # noqa: BLE001
                log.exception("translation batch failed (%s)", code)
    return out

def _translate_batch(chunk: list[str], src: str, torch, tok, model, proc) -> list[str | None]:
    with _translating:
        batch = proc.preprocess_batch(chunk, src_lang=src, tgt_lang=MT_TGT)
        enc = tok(batch, truncation=True, padding="longest",
                  max_length=MT_MAX_TOKENS, return_tensors="pt")
        with torch.inference_mode():
            # use_cache=False is required, not an optimisation: IndicTrans2's
            # modeling code expects the old tuple-style KV cache and crashes
            # on the Cache object transformers >=4.5x passes in.
            gen = model.generate(**enc, num_beams=5, max_length=MT_MAX_TOKENS, use_cache=False)
        decoded = tok.batch_decode(gen, skip_special_tokens=True)
        return [t.strip() or None for t in proc.postprocess_batch(decoded, lang=MT_TGT)]

def translator():
    """The function analysis uses to read non-English sentences, or None when
    translation is off or the weights are not provisioned."""
    return translate if MT_ENABLED and _load() else None

_SPELLED = {"1": "one|first", "2": "two|second", "3": "three|third", "4": "four|fourth",
            "5": "five|fifth", "6": "six|sixth", "7": "seven|seventh", "8": "eight|eighth",
            "9": "nine|ninth", "10": "ten|tenth"}

def check_terms(source: str, english: str) -> list[str]:
    """What a translation appears to have lost: domain terms, Latin-script names
    and — the failure that matters most — numbers. Returns labels for the reader;
    never alters the text. An empty list means nothing was found missing, not
    that the translation is right."""
    low = english.casefold()
    flags = [f"{term} → {expected[0]}" for term, expected in TERMS.items()
             if term in source and not any(e in low for e in expected)]
    flags += [name for name in LATIN_TERMS
              if re.search(rf"\b{name}\b", source) and name.casefold() not in low]
    # int() reads any script's digits, so "২১" in the source matches "21".
    out_numbers = {str(int(n)) for n in re.findall(r"\d+", english)}
    for n in dict.fromkeys(str(int(n)) for n in re.findall(r"\d+", source)):
        if n not in out_numbers and not (
                n in _SPELLED and re.search(rf"\b({_SPELLED[n]})\b", low)):
            flags.append(f"number {n}")
    return list(dict.fromkeys(flags))

def translate_findings(findings: list[dict]) -> list[dict]:
    """Fill text_en on every finding still without English, and note on every
    translated finding any terminology the translation seems to have dropped."""
    pending = [f for f in findings if f["orig_lang"] != "en" and not f["text_en"]]
    if pending and MT_ENABLED and _load():
        for f, text in zip(pending, translate([(f["orig_lang"], f["text_local"]) for f in pending])):
            if text:
                f["text_en"], f["translated"] = text, True
    for f in findings:
        if f.get("translated"):
            f["term_flags"] = check_terms(f["text_local"], f["text_en"])
    return findings
