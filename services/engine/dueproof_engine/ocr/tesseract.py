"""Rung 3: Tesseract, for scripts PaddleOCR's recogniser lacks, and a second
opinion on a page it read badly. engine-heavy only: it needs the tesseract
binary, its language packs, pytesseract and OpenCV (the `heavy` group).

Deskew before OCR, and map every box back after: see the demo README, "Why
the code does what it does".
"""
from __future__ import annotations

import math

import numpy as np

from dueproof_engine import config

MAX_SKEW_DEG = 8.0


def available() -> bool:
    """Tesseract, its Python wrapper and OpenCV are all present."""
    import importlib.util
    if any(importlib.util.find_spec(m) is None for m in ("cv2", "pytesseract")):
        return False
    return bool(config.installed_packs())


def _deskew(gray: np.ndarray) -> tuple[np.ndarray, np.ndarray | None]:
    """Straighten the page for OCR, returning the inverse affine for the boxes."""
    import cv2
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


def read(bgr: np.ndarray, langs: str | None = None) -> tuple[list[dict], float]:
    """OCR one page image. Returns (words with 0-1 boxes, mean confidence).
    `langs` is Tesseract's "+"-joined pack list (default: the enabled languages)."""
    import cv2
    import pytesseract
    pytesseract.pytesseract.tesseract_cmd = config.TESSERACT_CMD
    h, w = bgr.shape[:2]
    # bilateralFilter: edge-preserving and ~85x cheaper than fastNlMeansDenoising.
    gray, inv = _deskew(cv2.bilateralFilter(cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY), 5, 45, 45))
    binimg = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                   cv2.THRESH_BINARY, 31, 15)
    data = pytesseract.image_to_data(binimg, lang=langs or config.tesseract_langs(),
                                     output_type=pytesseract.Output.DICT,
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
