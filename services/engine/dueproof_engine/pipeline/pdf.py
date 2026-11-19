"""PDF access, on PDFium (pypdfium2, Apache-2.0/BSD).

Three things the pipeline needs from a PDF: open it safely, render a page to
pixels, and read the text layer as words with boxes. PDFium gives characters
with boxes; this module groups them into words, lines and blocks — the same
shape read.py has always consumed:

    {"text", "x0", "y0", "x1", "y1", "line_id", "block_id", "conf"}

with coordinates normalised 0-1 from the page's top-left, as displayed.

PDFium is not thread-safe, not even across different documents: two ingest
workers rendering at once crash the process inside its glyph cache. Every
call into it goes through LOCK; callers that touch documents or pages
directly (len, indexing, close) hold it too. The engine itself calls this
module only from inside a sandboxed child process (sandbox.py), one per
document, so the lock never makes one request wait for another.
"""
from __future__ import annotations

import ctypes
import functools
import math
import threading
import unicodedata

import numpy as np
import pypdfium2 as pdfium
import pypdfium2.raw as raw

from dueproof_engine.config import MAX_PAGE_CHARS, MAX_PAGE_PIXELS

# Grouping thresholds, in units of the current text height.
WORD_GAP = 0.6       # a horizontal gap wider than this splits a word (table cells)
LINE_OVERLAP = 0.3   # a glyph overlapping the word vertically by less than this is on a new line
BLOCK_GAP = 0.85     # space between lines larger than this starts a new block
MAX_RENDER_SIDE = 16383   # WebP's limit, and far past any real page at any DPI the engine uses

LOCK = threading.RLock()

def _locked(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        with LOCK:
            return fn(*args, **kwargs)
    return wrapper

class ReadError(ValueError):
    """A document that cannot be read, with the contract's reason code:
    "encrypted", "malformed", "too_large", "too_many_pages", "unsupported"."""

    def __init__(self, reason: str, message: str):
        super().__init__(message)
        self.reason = reason

@_locked
def open_pdf(source, password: str | None = None) -> pdfium.PdfDocument:
    """A PDF from a path or from bytes in memory (the engine never writes the
    source to disk)."""
    try:
        return pdfium.PdfDocument(source if isinstance(source, (bytes, bytearray)) else str(source),
                                  password=password)
    except pdfium.PdfiumError as exc:
        if "password" in str(exc).lower():
            raise ReadError("encrypted", "This PDF is password-protected") from exc
        raise ReadError("malformed", "This file could not be read as a PDF") from exc

@_locked
def is_encrypted(doc: pdfium.PdfDocument) -> bool:
    """Whether the file carries a security handler (it may still have opened
    without a password: owner-password-only PDFs do)."""
    return raw.FPDF_GetSecurityHandlerRevision(doc.raw) != -1

@_locked
def page_size(page: pdfium.PdfPage) -> tuple[float, float]:
    """Width and height in points, as displayed (after the page's rotation)."""
    w, h = page.get_size()
    return (h, w) if page.get_rotation() in (90, 270) else (w, h)

@_locked
def render(page: pdfium.PdfPage, dpi: int) -> np.ndarray:
    """The page as a BGR image. An A0 drawing at 300 DPI is a gigabyte of
    pixels, so the area is capped and the DPI lowered to fit; so is the
    longest side (a 200 x 9000 pt receipt would otherwise pass WebP's limit)."""
    w, h = page_size(page)
    area = (w / 72 * dpi) * (h / 72 * dpi)
    if area > MAX_PAGE_PIXELS:
        dpi = max(1, int(dpi * math.sqrt(MAX_PAGE_PIXELS / area)))
    scale = dpi / 72
    if max(w, h) * scale > MAX_RENDER_SIDE:
        scale = MAX_RENDER_SIDE / max(w, h)
    img = page.render(scale=scale).to_numpy()               # PDFium renders BGR(x)
    return np.ascontiguousarray(img[:, :, :3])

# /Rotate turns the displayed page clockwise. Boxes are grouped into words and
# lines on the page as authored, where text runs left to right, and turned
# for display afterwards. Pinned by tests/test_inputs.py against the ink.
_CW = {0: lambda x0, y0, x1, y1: (x0, y0, x1, y1),
       90: lambda x0, y0, x1, y1: (1 - y1, x0, 1 - y0, x1),
       180: lambda x0, y0, x1, y1: (1 - x1, 1 - y1, 1 - x0, 1 - y0),
       270: lambda x0, y0, x1, y1: (y0, 1 - x1, y1, 1 - x0)}

_SCALE = 20          # device units per point when asking PDFium where a glyph lands

def _display_box(page, size, l, b, r, t) -> tuple[float, float, float, float]:
    """A PDF-space box as a 0-1 box on the page as rendered. PDFium does the
    mapping, so CropBox offsets and /Rotate are its problem, not ours."""
    W, H = size
    xs, ys = [], []
    for x, y in ((l, b), (r, t)):
        dx, dy = ctypes.c_int(), ctypes.c_int()
        raw.FPDF_PageToDevice(page.raw, 0, 0, int(W * _SCALE), int(H * _SCALE), 0, x, y,
                              ctypes.byref(dx), ctypes.byref(dy))
        xs.append(dx.value / (W * _SCALE))
        ys.append(dy.value / (H * _SCALE))
    return min(xs), min(ys), max(xs), max(ys)

def _chars(tp, n: int):
    """(index, character) over a text page. PDFium hands out UTF-16 code
    units, so a character outside the Basic Multilingual Plane (an emoji, a
    mathematical letter, CJK Extension B) arrives as a surrogate pair: join
    it, at the first half's index, and drop a half that has no partner."""
    get = raw.FPDFText_GetUnicode
    i = 0
    while i < n:
        code = get(tp.raw, i)
        if 0xD800 <= code <= 0xDBFF and i + 1 < n and 0xDC00 <= (low := get(tp.raw, i + 1)) <= 0xDFFF:
            yield i, chr(0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00))
            i += 2
            continue
        if not 0xD800 <= code <= 0xDFFF:
            yield i, chr(code)
        i += 1

@_locked
def words(page: pdfium.PdfPage) -> list[dict]:
    """The text layer as words with boxes, line ids and block ids. A page
    with more than MAX_PAGE_CHARS characters is refused before any is read."""
    tp = page.get_textpage()
    try:
        n = tp.count_chars()
        if n > MAX_PAGE_CHARS:
            raise ReadError("too_large", f"A page has {n} characters of text; the limit is {MAX_PAGE_CHARS}")
        size = page.get_size()                          # as displayed
        rot = page.get_rotation() if page.get_rotation() in _CW else 0
        upright = _CW[(360 - rot) % 360]                 # display -> as authored
        out: list[dict] = []
        cur: dict | None = None
        line_id = -1
        new_line = True

        def close():
            nonlocal cur
            if cur and cur["text"].strip():
                out.append(cur)
            cur = None

        for i, ch in _chars(tp, n):
            if ch in "\r\n":                    # PDFium marks every line end
                close()
                new_line = True
                continue
            if ch.isspace() or ch in "\x00￾￿":
                close()
                continue
            l, b, r, t = tp.get_charbox(i)
            x0, y0, x1, y1 = upright(*_display_box(page, size, l, b, r, t))
            # Combining marks (vowel signs, viramas) belong to the letter before
            # them wherever their glyph happens to be drawn: above, below, even
            # to the left. They never start a word or a line.
            if unicodedata.category(ch)[0] == "M" or (x1 - x0 <= 0 and y1 - y0 <= 0):
                if cur:
                    cur["text"] += ch
                    if x1 > x0 and y1 > y0:
                        cur["x0"], cur["x1"] = min(cur["x0"], x0), max(cur["x1"], x1)
                    continue
                if x1 - x0 <= 0 and y1 - y0 <= 0:
                    continue
            if cur:
                height = max(cur["y1"] - cur["y0"], y1 - y0, 1e-4)
                overlap = min(cur["y1"], y1) - max(cur["y0"], y0)
                if overlap < LINE_OVERLAP * min(cur["y1"] - cur["y0"], y1 - y0):
                    close()
                    new_line = True
                elif x0 - cur["x1"] > WORD_GAP * height:
                    close()
            if cur is None:
                if new_line:
                    line_id += 1
                    new_line = False
                cur = {"text": ch, "x0": x0, "y0": y0, "x1": x1, "y1": y1,
                       "line_id": line_id, "conf": 1.0}
            else:
                cur["text"] += ch
                cur["x0"], cur["y0"] = min(cur["x0"], x0), min(cur["y0"], y0)
                cur["x1"], cur["y1"] = max(cur["x1"], x1), max(cur["y1"], y1)
        close()
    finally:
        tp.close()
    assign_blocks(out)
    turn = _CW[rot]
    for wd in out:
        box = [min(1.0, max(0.0, wd[k])) for k in ("x0", "y0", "x1", "y1")]
        wd["x0"], wd["y0"], wd["x1"], wd["y1"] = turn(*box)
    return out

def assign_blocks(words_: list[dict]) -> None:
    """Group lines into blocks (paragraphs, headings, cells): a new block starts
    where the gap above a line is wider than ordinary line spacing, or where the
    text jumps back up the page (a new column)."""
    lines: dict[int, list[dict]] = {}
    for w in words_:
        lines.setdefault(w["line_id"], []).append(w)
    block, prev = -1, None
    for lid in sorted(lines):
        ws = lines[lid]
        top, bottom = min(w["y0"] for w in ws), max(w["y1"] for w in ws)
        left = min(w["x0"] for w in ws)
        height = bottom - top
        if (prev is None
                or top - prev[1] > BLOCK_GAP * max(height, prev[1] - prev[0])
                or top < prev[0] - 0.5 * height
                or abs(left - prev[2]) > 0.25):
            block += 1
        for w in ws:
            w["block_id"] = block
        prev = (top, bottom, left)
