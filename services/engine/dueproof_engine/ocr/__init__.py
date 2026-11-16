"""OCR rungs beyond the text layer (planning/v0.1/03-architecture.md §6a).

paddle.py      rung 2: PaddleOCR (PP-OCR detection + recognition) on ONNX
               Runtime, with numpy and Pillow only — no OpenCV, no Paddle, so it
               fits engine-fast.
tesseract.py   rung 3: Tesseract, for scripts PaddleOCR's recogniser lacks.

Both return words as dicts {"text", "x0", "y0", "x1", "y1", "line_id",
"block_id", "conf"} with boxes 0-1 from the page's top-left, and a page
confidence 0-1 — the same shape as the PDFium text layer.
"""

RUNGS = ("text_layer", "paddleocr", "tesseract", "vision")


def rung_index(name: str) -> int:
    """Position of a rung on the ladder; "none" is below the first."""
    return RUNGS.index(name) if name in RUNGS else -1
