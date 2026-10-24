"""Malayalam: doubled combining marks, orphaned marks, words split across lines.

PDF producers emit a vowel sign or virama twice when the glyph came from a
ligature, hand a combining mark over as its own "word", and break a single word
across two lines with no hyphen. All three are repaired structurally — no
dictionary, because Malayalam compounds freely and a fixed lexicon would miss
real vocabulary and then join the wrong things with confidence.
"""
from __future__ import annotations

import re
import unicodedata

_LETTER = re.compile(r"[ഀ-ൿ]")
_DUP_MARK = re.compile(r"([ഀ-ഃ഻഼ാ-്ൗൢൣ])\1+")      # ligature-doubled vowel signs
_ONLY_MARKS = re.compile(r"^[ഀ-ഃ഻഼ാ-്ൗൢൣ‌‍]+$")
_CHILLU, _VOWEL_SIGN = "ർൻൽൾൺൿ", "ാിീുൂൃൄെേൈൊോൌ"

def clean(s: str) -> str:
    """NFC, then collapse a run of the same combining mark into one."""
    return _DUP_MARK.sub(r"\1", unicodedata.normalize("NFC", s))

def merge_orphans(words: list[dict]) -> list[dict]:
    """Reattach a combining mark that arrived as its own 'word'."""
    out: list[dict] = []
    for wd in words:
        if out and _ONLY_MARKS.match(wd["text"]):
            prev = out[-1]
            if not prev["text"].endswith(wd["text"]):
                prev["text"] = clean(prev["text"] + wd["text"])
            prev["x1"], prev["y1"] = max(prev["x1"], wd["x1"]), max(prev["y1"], wd["y1"])
        else:
            out.append(wd)
    return out

def is_split_word(prev: str, nxt: str) -> bool:
    """Did the renderer break one word across these two lines?

    Reliable signals: the continuation opens with a chillu or a combining mark
    (neither can begin a word), or the previous line ends in a short vowel stub.
    """
    tail, head = prev.rstrip()[-1:], nxt.lstrip()[:1]
    if not (tail and head and _LETTER.match(tail) and _LETTER.match(head)):
        return False
    if head in _CHILLU or _ONLY_MARKS.match(head):
        return True
    return tail in _VOWEL_SIGN and len(prev.rstrip().split()[-1]) <= 6
