"""Step 3 — citation linking: evidence quote -> page number + rectangles.

One rectangle PER LINE, not a union box: a quote wrapping across three lines
unioned into one rect swallows the left margin and any neighbouring column.
Matching is space-insensitive — see the README for why.
"""
from __future__ import annotations

import math
import unicodedata
import zlib

import numpy as np
from rapidfuzz import fuzz

STRONG, WEAK = 72.0, 55.0        # confident / show-but-flag-as-approximate
PAD_X, PAD_Y = 0.004, 0.0035
def _norm(s: str) -> str:
    """Letters, combining marks and digits only, in any script. A regex word
    class would drop the vowel signs that Indic and other abugida scripts are
    built from, since those are marks, not letters."""
    return "".join(c for c in unicodedata.normalize("NFC", s)
                   if unicodedata.category(c)[0] in "LMN" or c == "_").casefold()

def _norm_text(s: str) -> str:
    """Normalise and drop spaces entirely — word boundaries are the least
    trustworthy part of the signal, in complex-script PDFs and in OCR alike."""
    return "".join(filter(None, (_norm(t) for t in s.split())))

def build_index(words_by_page: dict[int, list[dict]]) -> dict[int, tuple]:
    """Normalise each page once: every quote is searched against every page."""
    index = {}
    for pno, words in words_by_page.items():
        parts, spans, cursor = [], [], 0
        for idx, wd in enumerate(words):
            if tok := _norm(wd["text"]):
                parts.append(tok)
                spans.append((cursor, cursor + len(tok), idx))
                cursor += len(tok)
        if parts:
            index[pno] = ("".join(parts), spans, words)
    return index

LINE_GAP = 0.02      # a column gutter is far wider than this; a word gap is not


def _stitch(rects: list[list[float]]) -> list[list[float]]:
    """Rejoin rects that are really one visual line.

    A producer can emit one justified line as several text runs, each with its
    own line, leaving a gap that can fall inside a word. Merge boxes that sit in
    the same vertical band and within LINE_GAP horizontally; a neighbouring
    column is much further away, and the slices of a tilted line (see
    _segments) are never in quite the same band.
    """
    out: list[list[float]] = []
    for r in sorted(rects, key=lambda r: (r[1], r[0])):
        if out:
            p = out[-1]
            overlap = min(p[3], r[3]) - max(p[1], r[1])
            if overlap > 0.85 * max(p[3] - p[1], r[3] - r[1]) and r[0] - p[2] < LINE_GAP:
                out[-1] = [min(p[0], r[0]), min(p[1], r[1]), max(p[2], r[2]), max(p[3], r[3])]
                continue
        out.append(r)
    return out

def _segments(line: list[dict]) -> list[list[dict]]:
    """Slice a line wherever its words drift off the band the slice started
    in. On a straight page that is never, and the line is one box. On a tilted
    scan one box per line would be a parallelogram's bounding box, reaching up
    into the line above and down into the one below; slices keep each box on
    its own words."""
    out: list[list[dict]] = []
    for w in sorted(line, key=lambda w: w["x0"]):
        if out:
            first = out[-1][0]
            overlap = min(first["y1"], w["y1"]) - max(first["y0"], w["y0"])
            if overlap >= 0.5 * min(first["y1"] - first["y0"], w["y1"] - w["y0"]):
                out[-1].append(w)
                continue
        out.append([w])
    return out

def _rects_for(words: list[dict], indices: list[int]) -> list[list[float]]:
    """One box per line of matched words (per slice of a tilted line)."""
    by_line: dict[int, list[dict]] = {}
    for i in indices:
        by_line.setdefault(words[i]["line_id"], []).append(words[i])
    return _stitch(
        [[round(max(0.0, min(w["x0"] for w in g) - PAD_X), 5),
          round(max(0.0, min(w["y0"] for w in g) - PAD_Y), 5),
          round(min(1.0, max(w["x1"] for w in g) + PAD_X), 5),
          round(min(1.0, max(w["y1"] for w in g) + PAD_Y), 5)]
         for _, line in sorted(by_line.items(), key=lambda kv: min(w["y0"] for w in kv[1]))
         for g in _segments(line)])

def _match_page(quote: str, page: tuple) -> tuple[float, list[list[float]]]:
    hay, spans, words = page
    pos = hay.find(quote)
    if pos >= 0:                          # verbatim: typical for native text layers
        start, end, score = pos, pos + len(quote), 100.0
    else:
        al = fuzz.partial_ratio_alignment(quote, hay, score_cutoff=WEAK)
        if al is None:
            return 0.0, []
        start, end, score = al.dest_start, al.dest_end, al.score
    hit = [wi for (cs, ce, wi) in spans if cs < end and ce > start]
    return (float(score), _rects_for(words, hit)) if hit else (0.0, [])

def link_quote(quote: str, index: dict[int, tuple], hint_page: int | None = None) -> dict:
    """Locate `quote` in the document. Returns page_num, rects, score, confidence."""
    q = _norm_text(quote or "")
    best = {"page_num": hint_page, "rects": [], "score": 0.0}
    if len(q) >= 6:
        for pno in sorted(index, key=lambda p: (p != hint_page, p)):   # hinted page first
            score, rects = _match_page(q, index[pno])
            if rects and score > best["score"] + 0.01:
                best = {"page_num": pno, "rects": rects, "score": round(score, 2)}
            if best["score"] >= 100.0:
                break                     # verbatim hit; no later page can beat it
    best["confidence"] = confidence_of(best["score"])
    if best["confidence"] == "none":
        best["rects"] = []
    return best

def find_all(term: str, page: tuple, limit: int = 20) -> list[list[float]]:
    """Rectangles for every verbatim occurrence of `term` on one indexed page —
    what a search hit shows. Exact matches only: search never guesses."""
    hay, spans, words = page
    q, rects, pos = _norm_text(term), [], 0
    if len(q) < 2:
        return []
    while len(rects) < limit and (pos := hay.find(q, pos)) >= 0:
        end = pos + len(q)
        rects += _rects_for(words, [wi for (cs, ce, wi) in spans if cs < end and ce > pos])
        pos = end
    return rects[:limit]

def confidence_of(score: float | None) -> str:
    """One definition of the confidence bands, shared with the API layer."""
    s = score or 0.0
    return "exact" if s >= 99 else "strong" if s >= STRONG else \
        "approximate" if s >= WEAK else "none"

def near_duplicate_score(a: str, b: str) -> float:
    """Cheap cross-document similarity — the 'same circular, two channels' case."""
    return float(fuzz.token_set_ratio(_norm_text(a)[:6000], _norm_text(b)[:6000]))

# candidate blocking for duplicate detection
# near_duplicate_score is the arbiter, but running it against every document on
# every ingest is linear in the corpus with the full text as payload. A MinHash
# signature over character shingles estimates overlap from 192 integers; stored
# one row per (position, value), "which documents overlap enough to be worth
# scoring" becomes an indexed GROUP BY that never reads anybody's text.
#
# Sized from measurement, not taste: under uniform character noise — the worst
# case, real OCR errors come in bursts — a pair that still scores 80 has a
# 4-shingle Jaccard of 0.23 or more. Unrelated documents from one organisation, sharing a
# letterhead sit near 0.08. CANDIDATE_FLOOR is more than three standard errors
# below the first number, and tests/test_duplicates.py sweeps it.
SHINGLE, SIG_SIZE, CANDIDATE_FLOOR = 4, 192, 0.12
_PRIME = 4294967311                                 # the first prime above 2**32
_rng = np.random.default_rng(20260807)              # fixed: signatures must be comparable
_A = _rng.integers(1, 2**31, SIG_SIZE, dtype=np.uint64)[:, None]
_B = _rng.integers(0, 2**31, SIG_SIZE, dtype=np.uint64)[:, None]

def signature(text: str) -> list[str]:
    """MinHash signature of the text the duplicate scorer would see, as
    "position:value" keys; two signatures overlap by the share of keys they have
    in common. Empty when there is too little text to shingle. zlib.crc32, not
    hash(): Python salts hash() per process, and a stored signature has to mean
    the same thing tomorrow."""
    t = _norm_text(text)[:6000]
    grams = {t[i:i + SHINGLE] for i in range(len(t) - SHINGLE + 1)}
    if not grams:
        return []
    h = np.fromiter((zlib.crc32(g.encode("utf-8")) for g in grams), np.uint64, len(grams))
    mins = ((_A * h[None, :] + _B) % _PRIME).min(axis=1).tolist()
    return [f"{i}:{v}" for i, v in enumerate(mins)]

# Shared keys needed before the scorer is consulted.
CANDIDATE_KEYS = math.ceil(CANDIDATE_FLOOR * SIG_SIZE)
