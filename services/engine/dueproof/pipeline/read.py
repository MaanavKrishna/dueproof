"""Step 1 — read the PDF: page images, word boxes, reading-order text.

Native text layer where the PDF has one (exact boxes from PyMuPDF), Tesseract
otherwise. Downstream only sees `words` (text + box normalised 0-1) and
`page_texts`, so the two paths are interchangeable from here on.
See README "Why the code does what it does" for the reasoning behind the
script repair, the deskew-and-map-back, and the block reflow.
"""
from __future__ import annotations

import math
import re

import cv2
import numpy as np
import pytesseract

from dueproof.config import (DISPLAY_DPI, DISPLAY_QUALITY, LOCALS, MAX_PAGE_PIXELS, MAX_PAGES,
                    OCR_DPI, OCR_LANGS, PAGES, TESSERACT_CMD)
from dueproof.pipeline import pdf
from dueproof.pipeline.scripts import clean, is_split_word, merge_orphans

pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD

SCRIPTS = [(lang["code"], re.compile(f"[{lang['script']}]")) for lang in LOCALS]
LATIN = re.compile(r"[A-Za-z]")
NATIVE_WORD_FLOOR = 25      # fewer real words than this => treat the page as scanned
MAX_SKEW_DEG = 8.0

# OCR — deskew before, map every box back after
def _deskew(gray: np.ndarray) -> tuple[np.ndarray, np.ndarray | None]:
    """Straighten the page for OCR, returning the inverse affine for the boxes."""
    lines = cv2.HoughLinesP(cv2.Canny(gray, 60, 180, apertureSize=3), 1, np.pi / 720,
                            threshold=140, minLineLength=max(60, gray.shape[1] // 6), maxLineGap=12)
    angles = [a for x1, y1, x2, y2 in (np.asarray(lines).reshape(-1, 4) if lines is not None else [])
              if x2 != x1 for a in [math.degrees(math.atan2(y2 - y1, x2 - x1))]
              if abs(a) <= MAX_SKEW_DEG]          # near-horizontal rules and text lines only
    if len(angles) < 5 or abs(float(np.median(angles))) <= 0.15:
        return gray, None
    h, w = gray.shape
    m = cv2.getRotationMatrix2D((w / 2.0, h / 2.0), float(np.median(angles)), 1.0)
    return (cv2.warpAffine(gray, m, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE),
            cv2.invertAffineTransform(m))

def _map_back(box, inv):
    """Axis-aligned bbox of the four corners pushed through the inverse affine."""
    if inv is None:
        return box
    x0, y0, x1, y1 = box
    p = np.array([[x0, y0, 1], [x1, y0, 1], [x1, y1, 1], [x0, y1, 1]], np.float32) @ inv.T
    return float(p[:, 0].min()), float(p[:, 1].min()), float(p[:, 0].max()), float(p[:, 1].max())

def ocr_page(bgr: np.ndarray) -> tuple[list[dict], float]:
    """OCR one page image. Returns (words with 0-1 boxes, mean confidence)."""
    h, w = bgr.shape[:2]
    # bilateralFilter: edge-preserving and ~85x cheaper than fastNlMeansDenoising.
    gray, inv = _deskew(cv2.bilateralFilter(cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY), 5, 45, 45))
    binimg = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                   cv2.THRESH_BINARY, 31, 15)
    data = pytesseract.image_to_data(binimg, lang=OCR_LANGS, output_type=pytesseract.Output.DICT,
                                     config="--oem 1 --psm 6 -c preserve_interword_spaces=1")
    words, confs, line_ids = [], [], {}
    for i, raw in enumerate(data["text"]):
        text, conf = (raw or "").strip(), float(data["conf"][i])
        if not text or conf < 0:
            continue
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        x, y = data["left"][i], data["top"][i]
        x0, y0, x1, y1 = _map_back((x, y, x + data["width"][i], y + data["height"][i]), inv)
        words.append({"block_id": int(data["block_num"][i]), "text": text,
                      "line_id": line_ids.setdefault(key, len(line_ids)),
                      "x0": max(0.0, x0 / w), "y0": max(0.0, y0 / h),
                      "x1": min(1.0, x1 / w), "y1": min(1.0, y1 / h), "conf": conf / 100})
        confs.append(conf / 100)
    return words, (sum(confs) / len(confs) if confs else 0.0)

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

def _page(doc_id: str, pno: int, display: np.ndarray, words: list[dict] | None, scan) -> tuple:
    """One page: save its image, take the text layer if it has enough words,
    otherwise OCR `scan()` (rendered only when needed). Returns (words, conf, source)."""
    out_dir = PAGES / doc_id
    out_dir.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out_dir / f"{pno}.jpg"), display,
                [int(cv2.IMWRITE_JPEG_QUALITY), DISPLAY_QUALITY])
    if words is not None and len(words) >= NATIVE_WORD_FLOOR:
        conf, source = 1.0, "native"
    else:
        words, conf = ocr_page(scan())
        source = "ocr"
    words = merge_orphans(words)
    for wd in words:
        wd["page_num"], wd["text"] = pno, clean(wd["text"])
    return words, conf, source

def _result(pages: list[tuple]) -> dict:
    all_words = [w for words, _, _ in pages for w in words]
    page_texts = [page_text(words) for words, _, _ in pages]
    confs = [conf for _, conf, _ in pages]
    sources = {source for _, _, source in pages}
    full_text = "\n\n".join(page_texts)
    counts = ([(code, len(rx.findall(full_text)), 12) for code, rx in SCRIPTS]
              + [("en", len(LATIN.findall(full_text)), 40)])
    langs = [lang for lang, hits, floor in counts if hits >= floor] or ["en"]
    return {"page_count": len(pages), "words": all_words, "page_texts": page_texts,
            "full_text": full_text, "languages": langs,
            "ocr_confidence": round(sum(confs) / len(confs), 4) if confs else 0.0,
            "text_source": "mixed" if len(sources) > 1 else (sources.pop() if sources else "ocr")}

def read_pdf(doc_id: str, pdf_path, progress=None) -> dict:
    """Render every page, harvest words, reconstruct text."""
    doc = pdf.open_pdf(pdf_path)
    try:
        with pdf.LOCK:
            n = len(doc)
        if not 0 < n <= MAX_PAGES:
            raise ValueError(f"This PDF has {n} pages; the limit is {MAX_PAGES}")
        pages = []
        for pno in range(n):
            with pdf.LOCK:                          # PDFium work only; OCR runs unlocked
                page = doc[pno]
                image, layer = pdf.render(page, DISPLAY_DPI), pdf.words(page)
            try:
                pages.append(_page(doc_id, pno + 1, image, layer,
                                   lambda: pdf.render(page, OCR_DPI)))
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
DISPLAY_LONG_SIDE = 1700        # about A4 at DISPLAY_DPI

def read_image(doc_id: str, path, progress=None) -> dict:
    """Every frame of an image file (multi-page TIFFs included), through OCR."""
    ok, frames = cv2.imreadmulti(str(path), flags=cv2.IMREAD_COLOR)
    if not ok or not frames:
        img = cv2.imread(str(path), cv2.IMREAD_COLOR)    # applies EXIF orientation
        if img is None:
            raise ValueError("This file could not be read as an image")
        frames = [img]
    if len(frames) > MAX_PAGES:
        raise ValueError(f"This image has {len(frames)} pages; the limit is {MAX_PAGES}")
    pages = []
    for pno, img in enumerate(frames, 1):
        h, w = img.shape[:2]
        if h * w > MAX_PAGE_PIXELS:
            f = math.sqrt(MAX_PAGE_PIXELS / (h * w))
            img = cv2.resize(img, (int(w * f), int(h * f)), interpolation=cv2.INTER_AREA)
            h, w = img.shape[:2]
        f = min(1.0, DISPLAY_LONG_SIDE / max(h, w))
        display = img if f == 1.0 else cv2.resize(img, (int(w * f), int(h * f)),
                                                  interpolation=cv2.INTER_AREA)
        pages.append(_page(doc_id, pno, display, None, lambda: img))
        if progress:
            progress(pno, len(frames))
    return _result(pages)
