"""Step 1 — read a document: page images, word boxes, reading-order text.

Each page climbs the OCR ladder (planning/v0.1/03-architecture.md §6a) only
as far as it needs to:

  1. text_layer   PDFium's text layer, where the PDF has a real one
  2. paddleocr    PP-OCR on ONNX Runtime (ocr/paddle.py) — engine-fast
  3. tesseract    Tesseract (ocr/tesseract.py) — engine-heavy
  4. vision       not here: the workflow's AI step, for pages still below the bar

`max_rung` caps the climb. A page whose best reading is below the confidence
bar is listed in `needs_escalation`. Downstream only sees `words` (text + box
normalised 0-1 + line and block ids) and the page texts, so every rung is
interchangeable from here on. See the demo README, "Why the code does what it
does", for the script repair and the block reflow.
"""
from __future__ import annotations

import io
import math
import re
import warnings
from pathlib import Path
from typing import Callable

import numpy as np
from PIL import Image, ImageOps, ImageSequence

from dueproof_engine import config
from dueproof_engine.config import (DISPLAY_DPI, LOCALS, MAX_IMAGE_PIXELS, MAX_PAGE_PIXELS,
                                    MAX_PAGES, OCR_CONFIDENCE_BAR, OCR_DPI, PADDLE_DPI)
from dueproof_engine.languages import LANGUAGES, enabled
from dueproof_engine.ocr import rung_index
from dueproof_engine.pipeline import pdf
from dueproof_engine.pipeline.scripts import clean, is_split_word, merge_orphans

LATIN = re.compile(r"[A-Za-z]")
NATIVE_WORD_FLOOR = 25      # fewer real words than this => treat the page as scanned
DISPLAY_LONG_SIDE = 1700    # an image page's display copy: about A4 at DISPLAY_DPI
BLANK_STD = 8.0             # a page image this flat has nothing on it to read

Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS     # Pillow's decompression-bomb guard

ReadError = pdf.ReadError


# What a file is, from its first bytes — the name and the declared type prove nothing.
def sniff(head: bytes) -> str | None:
    """The MIME type the bytes really are, or None. A PDF header may sit
    anywhere in the first 1024 bytes, per the specification."""
    if b"%PDF-" in head[:1024]:
        return "application/pdf"
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head[:4] in (b"II*\x00", b"MM\x00*"):
        return "image/tiff"
    return None


# text reconstruction
def _join(a: str, b: str) -> str:
    return b if not a else a + ("" if is_split_word(a, b) else " ") + b

def page_text(words: list[dict]) -> str:
    """Reflow to one paragraph per line, joining within a PDF block."""
    blocks: dict = {}
    for wd in words:
        blocks.setdefault(wd["block_id"], {}).setdefault(wd["line_id"], []).append(wd)
    # A line reaching the right edge of the body text was wrapped, so its
    # sentence continues — that, not punctuation, separates prose from headings.
    ends = [max(w["x1"] for w in ln) for lines in blocks.values() for ln in lines.values()]
    right_edge = max(ends) if ends else 1.0

    out: list[str] = []
    flush_tail, prev_geom = False, None      # prev_geom = (y1, x0, line height)
    for _, lines in sorted(blocks.items()):
        ordered = [ln for _, ln in sorted(lines.items())]
        joined = ""
        for ln in ordered:
            joined = _join(joined, " ".join(w["text"] for w in ln))
        if not (joined := " ".join(joined.split())):
            continue
        top, left = min(w["y0"] for w in ordered[0]), min(w["x0"] for w in ordered[0])
        # Continue the previous block only if this one sits directly beneath it
        # in the same column, else a flush-right line swallows the footer.
        # Boxes are tight glyph boxes, so ordinary line spacing is well under
        # 1.2 line heights and a paragraph break is well over it.
        adjacent = (prev_geom and 0 <= top - prev_geom[0] < max(prev_geom[2] * 1.2, 0.008)
                    and abs(left - prev_geom[1]) < 0.06)
        if out and flush_tail and adjacent and len(out[-1]) < 2000:
            out[-1] = _join(out[-1], joined)
        else:
            out.append(joined)
        last = ordered[-1]
        y1, y0 = max(w["y1"] for w in last), min(w["y0"] for w in last)
        flush_tail = max(w["x1"] for w in last) >= right_edge - 0.02
        prev_geom = (y1, left, max(y1 - y0, 0.004))
    return "\n".join(out)


# languages
def _script_table(hints: list[str] | None) -> list[tuple[str, re.Pattern]]:
    """One (code, script pattern) per script. Several languages share a script
    (Hindi, Marathi, Nepali); the hints decide who claims it, then the enabled
    languages, then the registry's order."""
    codes = [c for c in (hints or []) if c in LANGUAGES]
    codes += [lang["code"] for lang in LOCALS] + list(LANGUAGES)
    return [(lang["code"], re.compile(f"[{lang['script']}]")) for lang in enabled(list(dict.fromkeys(codes)))]

def detect_languages(text: str, hints: list[str] | None = None, local_first: bool = True) -> list[str]:
    """The languages a page is written in, by script: a local script counts
    from 12 characters, English from 40 Latin letters. ["en"] when unsure."""
    found = [(code, len(rx.findall(text)), 12) for code, rx in _script_table(hints)]
    found = [(c, n) for c, n, floor in found if n >= floor]
    found.sort(key=lambda t: -t[1])
    langs = [c for c, _ in found]
    if len(LATIN.findall(text)) >= 40:
        langs = langs + ["en"] if local_first else ["en"] + langs
    return langs or ["en"]


# the ladder
def _blank(img: np.ndarray) -> bool:
    return float(np.asarray(img, np.float32).std()) < BLANK_STD

def _ocr(scan: Callable[[int], np.ndarray], max_rung: str, hints: list[str] | None) -> tuple:
    """Climb rungs 2-3 for one page image. Returns (words, confidence, engine);
    engine "none" when no rung was allowed or available."""
    from dueproof_engine.ocr import paddle, tesseract
    best: tuple = ([], 0.0, "none")
    if rung_index(max_rung) >= rung_index("paddleocr") and (eng := paddle.engine()):
        words, conf = eng.read(scan(PADDLE_DPI))
        best = (words, conf, "paddleocr")
        if conf >= OCR_CONFIDENCE_BAR:
            return best
    if rung_index(max_rung) >= rung_index("tesseract") and tesseract.available():
        words, conf = tesseract.read(scan(OCR_DPI), config.tesseract_langs(hints))
        if best[2] == "none" or conf > best[1]:
            best = (words, conf, "tesseract")
    return best

def _page(pno: int, size: tuple[float, float], rotation: int, display: np.ndarray,
          layer: list[dict] | None, scan: Callable[[int], np.ndarray], max_rung: str,
          hints: list[str] | None, on_image) -> dict:
    """One page: hand its display image over, take the text layer if it has
    enough words, otherwise climb the OCR ladder."""
    if on_image:
        on_image(pno, display)
    if layer is not None and len(layer) >= NATIVE_WORD_FLOOR:
        words, conf, engine = layer, 1.0, "text_layer"
    else:
        words, conf, engine = _ocr(scan, max_rung, hints)
        if engine == "none":
            if layer:                           # a sparse but real text layer
                words, conf, engine = layer, 1.0, "text_layer"
            elif _blank(display):
                conf = 1.0                      # nothing on the page to read
    words = merge_orphans(words)
    for wd in words:
        wd["page_num"], wd["text"] = pno, clean(wd["text"])
    text = page_text(words)
    return {"page": pno, "width": round(size[0], 2), "height": round(size[1], 2),
            "rotation": rotation, "words": words, "text": text, "engine": engine,
            "confidence": round(min(1.0, max(0.0, conf)), 4),
            "languages": detect_languages(text, hints),
            "escalate": engine != "text_layer" and conf < OCR_CONFIDENCE_BAR}

def _result(pages: list[dict]) -> dict:
    page_texts = [p["text"] for p in pages]
    full_text = "\n\n".join(page_texts)
    # Document-level languages, over the enabled ones, as the demo reported them.
    counts = ([(lang["code"], len(re.findall(f"[{lang['script']}]", full_text)), 12) for lang in LOCALS]
              + [("en", len(LATIN.findall(full_text)), 40)])
    langs = [lang for lang, hits, floor in counts if hits >= floor] or ["en"]
    sources = {"native" if p["engine"] == "text_layer" else "ocr" for p in pages}
    confs = [p["confidence"] for p in pages]
    return {"page_count": len(pages), "pages": pages,
            "words": [w for p in pages for w in p["words"]],
            "page_texts": page_texts, "full_text": full_text, "languages": langs,
            "ocr_confidence": round(sum(confs) / len(confs), 4) if confs else 0.0,
            "text_source": "mixed" if len(sources) > 1 else (sources.pop() if sources else "ocr"),
            "needs_escalation": [p["page"] for p in pages if p["escalate"]]}


# PDFs
def read_pdf(source: Path | str | bytes, *, password: str | None = None, max_rung: str = "tesseract",
             languages: list[str] | None = None, on_image=None, progress=None) -> dict:
    """Render every page, harvest words, reconstruct text. `on_image(page,
    bgr)` receives each page's display image (DISPLAY_DPI)."""
    doc = pdf.open_pdf(source, password)
    try:
        with pdf.LOCK:
            n = len(doc)
        if n == 0:
            raise ReadError("malformed", "This PDF has no pages")
        if n > MAX_PAGES:
            raise ReadError("too_many_pages", f"This PDF has {n} pages; the limit is {MAX_PAGES}")
        pages = []
        for pno in range(n):
            with pdf.LOCK:                          # PDFium work only; OCR runs unlocked
                page = doc[pno]
                size, rotation = pdf.page_size(page), page.get_rotation()
                image, layer = pdf.render(page, DISPLAY_DPI), pdf.words(page)
            try:
                pages.append(_page(pno + 1, size, rotation, image, layer,
                                   lambda dpi: pdf.render(page, dpi), max_rung, languages, on_image))
            finally:
                with pdf.LOCK:
                    page.close()
            if progress:
                progress(pno + 1, n)
    finally:
        with pdf.LOCK:
            doc.close()
    return _result(pages)


# Photographs and scans that arrive as images rather than PDFs: a phone photo
# of a notice is the most common way paper reaches anyone in India.
def image_frames(source: Path | str | bytes) -> list[np.ndarray]:
    """Every frame of an image file (multi-page TIFFs included), upright per
    its EXIF orientation, as BGR arrays. Pixel counts are checked from the
    header before anything is decoded."""
    data = source if isinstance(source, bytes) else Path(source).read_bytes()
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            im = Image.open(io.BytesIO(data))
            frames = []
            for n, frame in enumerate(ImageSequence.Iterator(im)):
                if n >= MAX_PAGES:
                    raise ReadError("too_many_pages", f"This image has more than {MAX_PAGES} pages")
                w, h = frame.size
                if w * h > MAX_IMAGE_PIXELS:
                    raise ReadError("too_large", f"An image page of {w}x{h} pixels is over the limit")
                rgb = (ImageOps.exif_transpose(frame) if n == 0 else frame).convert("RGB")
                frames.append(np.ascontiguousarray(np.asarray(rgb)[:, :, ::-1]))
    except ReadError:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ReadError("too_large", "This image has too many pixels") from exc
    except (OSError, ValueError, SyntaxError, EOFError) as exc:
        raise ReadError("malformed", "This file could not be read as an image") from exc
    if not frames:
        raise ReadError("malformed", "This file could not be read as an image")
    return frames

def _scale(img: np.ndarray, factor: float) -> np.ndarray:
    h, w = img.shape[:2]
    size = (max(1, int(w * factor)), max(1, int(h * factor)))
    return np.asarray(Image.fromarray(img).resize(size, Image.LANCZOS))

def read_image(source: Path | str | bytes, *, max_rung: str = "tesseract",
               languages: list[str] | None = None, on_image=None, progress=None) -> dict:
    """Every frame of an image file, through OCR. A page's width and height
    are its pixel size (an image has no points)."""
    frames = image_frames(source)
    pages = []
    for pno, img in enumerate(frames, 1):
        h, w = img.shape[:2]
        size = (float(w), float(h))
        if h * w > MAX_PAGE_PIXELS:
            img = _scale(img, math.sqrt(MAX_PAGE_PIXELS / (h * w)))
            h, w = img.shape[:2]
        f = min(1.0, DISPLAY_LONG_SIDE / max(h, w))
        display = img if f == 1.0 else _scale(img, f)
        pages.append(_page(pno, size, 0, display, None, lambda dpi, img=img: img,
                           max_rung, languages, on_image))
        if progress:
            progress(pno, len(frames))
    return _result(pages)

def read_document(data: bytes, *, password: str | None = None, max_rung: str = "tesseract",
                  languages: list[str] | None = None, on_image=None) -> dict:
    """Read a PDF or an image, by what its bytes are."""
    kind = sniff(data[:1024])
    if kind is None:
        raise ReadError("unsupported", "This file is not a PDF, JPEG, PNG or TIFF")
    if kind == "application/pdf":
        return read_pdf(data, password=password, max_rung=max_rung, languages=languages,
                        on_image=on_image)
    return read_image(data, max_rung=max_rung, languages=languages, on_image=on_image)
