"""Script-specific repair: mending the damage PDF producers and OCR do to a
writing system before anything downstream reads the text.

A repair module provides three functions —

    clean(text) -> text                     normalise one word or line
    merge_orphans(words) -> words           reattach marks that arrived alone
    is_split_word(prev_line, next_line)     did a line break fall inside a word?

— and a language names its module in languages.py. Every enabled language's
repair is applied; each touches only its own script. With none, text is
NFC-normalised and otherwise left alone.
"""
from __future__ import annotations

import importlib
import unicodedata

from dueproof.config import LOCALS

_REPAIRS = [importlib.import_module(f"dueproof.pipeline.scripts.{lang['repair']}")
            for lang in LOCALS if lang["repair"]]

def clean(s: str) -> str:
    s = unicodedata.normalize("NFC", s)
    for r in _REPAIRS:
        s = r.clean(s)
    return s

def merge_orphans(words: list[dict]) -> list[dict]:
    for r in _REPAIRS:
        words = r.merge_orphans(words)
    return words

def is_split_word(prev: str, nxt: str) -> bool:
    return any(r.is_split_word(prev, nxt) for r in _REPAIRS)
