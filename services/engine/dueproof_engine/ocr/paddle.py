"""Rung 2: PaddleOCR detection + recognition on ONNX Runtime.

PaddleOCR's own pipeline (and RapidOCR, which wraps it) needs OpenCV, Shapely
and pyclipper: about 160 MB that would push engine-fast past Vercel's 250 MB
function limit. Everything those libraries do here is small, so it is done
with numpy and Pillow instead:

* detection (DB): the probability map is thresholded, connected regions are
  found by run-length labelling, and each region's orientation comes from its
  second moments — a rotated box without minAreaRect. The box is grown by the
  DB "unclip" distance (area x ratio / perimeter), as PaddleOCR does.
* recognition (CTC): each box is cut out straight with a Pillow QUAD
  transform, resized to height 48, batched, decoded greedily. Each character's
  time step gives its position, so every *word* gets its own box — what proof
  linking needs.

Models: any PP-OCR det/rec ONNX pair. The recogniser's character list is read
from the model's metadata ("character"), or from a dict.txt beside it. The
files come from `scripts/fetch_ocr_models.py` (Apache-2.0; see NOTICE).
"""
from __future__ import annotations

import logging
import math
import os
import threading
from pathlib import Path

import numpy as np
from PIL import Image

from dueproof_engine import config

log = logging.getLogger("dueproof.ocr.paddle")

# PaddleOCR's DB post-processing defaults.
DET_THRESH, BOX_THRESH, UNCLIP_RATIO, MIN_SIZE = 0.3, 0.5, 1.6, 3
DET_MIN_SIDE, DET_MAX_SIDE = 736, 2560
# PP-OCRv5/v6 detection normalises to [-1, 1] (RapidOCR's settings for them).
DET_MEAN = np.array([0.5, 0.5, 0.5], np.float32)
DET_STD = np.array([0.5, 0.5, 0.5], np.float32)
REC_HEIGHT, REC_BATCH, REC_MAX_WIDTH = 48, 8, 3200
DROP_SCORE = 0.75           # a line read with less confidence than this is noise: dropped
UNREADABLE = 0.75           # below this a region counts as unread in the page's confidence
MAX_TILT_DEG = 20.0         # steeper than this is not a text line on a page
TRIM_TOP, TRIM_BOTTOM = 0.12, 0.18   # share of a detected line box that is padding, not ink
BLOCK_PITCH = 1.45          # line-centre distance, in line pitches, that starts a new block

class Unavailable(RuntimeError):
    pass


def _find(folder: Path, kind: str) -> Path | None:
    hits = sorted(p for p in folder.glob("*.onnx") if f"_{kind}" in p.name.lower()
                  or p.name.lower().startswith(kind))
    return hits[0] if hits else None


def model_dir() -> Path:
    """Where the det/rec models are: DUEPROOF_PADDLE_MODELS (default
    services/engine/models/ppocr), else the models an installed `rapidocr`
    package ships with."""
    if _find(config.PADDLE_MODEL_DIR, "det") and _find(config.PADDLE_MODEL_DIR, "rec"):
        return config.PADDLE_MODEL_DIR
    try:
        import importlib.util
        spec = importlib.util.find_spec("rapidocr")
        if spec and spec.origin:
            folder = Path(spec.origin).parent / "models"
            if _find(folder, "det") and _find(folder, "rec"):
                return folder
    except (ImportError, ValueError):
        pass
    raise Unavailable(f"no PP-OCR det/rec models in {config.PADDLE_MODEL_DIR};"
                      " run scripts/fetch_ocr_models.py")


class PaddleOCR:
    """One loaded det/rec pair. Thread-safe: ONNX Runtime sessions may be run
    from several threads at once."""

    def __init__(self, folder: Path):
        import onnxruntime as ort
        opts = ort.SessionOptions()
        opts.log_severity_level = 3
        opts.intra_op_num_threads = int(os.environ.get("DUEPROOF_OCR_THREADS") or 0)
        providers = ["CPUExecutionProvider"]
        self.det_path, self.rec_path = _find(folder, "det"), _find(folder, "rec")
        self.det = ort.InferenceSession(str(self.det_path), opts, providers=providers)
        self.rec = ort.InferenceSession(str(self.rec_path), opts, providers=providers)
        meta = self.rec.get_modelmeta().custom_metadata_map
        if "character" in meta:
            chars = meta["character"].splitlines()
        elif (dict_txt := folder / "dict.txt").is_file():
            chars = dict_txt.read_text(encoding="utf-8").splitlines()
        else:
            raise Unavailable(f"{self.rec_path.name} carries no character list and no dict.txt")
        # Keep the list exactly as stored, empty entries included: class
        # indices are positions in it.
        classes = self.rec.get_outputs()[0].shape[-1]
        # CTC: class 0 is blank, then the dictionary, then (usually) a space.
        self.charset = ["<blank>"] + chars + ([" "] if isinstance(classes, int)
                                              and classes == len(chars) + 2 else [])
        self.covered = frozenset(c for c in chars if c)
        self.name = f"{self.det_path.stem}+{self.rec_path.stem}"

    def covers(self, sample: str) -> bool:
        """Can the recogniser write these characters at all?"""
        return all(c in self.covered for c in sample if not c.isspace())

    # ---- detection ------------------------------------------------------
    def detect(self, bgr: np.ndarray) -> list[tuple[np.ndarray, float]]:
        """Text regions as (4 corners in image pixels: tl, tr, br, bl, score)."""
        h, w = bgr.shape[:2]
        ratio = max(1.0, DET_MIN_SIDE / min(h, w))
        if max(h, w) * ratio > DET_MAX_SIDE:
            ratio = DET_MAX_SIDE / max(h, w)
        rh, rw = max(32, int(round(h * ratio / 32)) * 32), max(32, int(round(w * ratio / 32)) * 32)
        img = np.asarray(Image.fromarray(bgr).resize((rw, rh), Image.BILINEAR), np.float32)
        x = ((img / 255.0 - DET_MEAN) / DET_STD).transpose(2, 0, 1)[None]
        prob = self.det.run(None, {self.det.get_inputs()[0].name: x.astype(np.float32)})[0][0, 0]
        sx, sy = w / rw, h / rh
        out = []
        for quad, score in _regions(prob):
            quad = quad * np.array([sx, sy], np.float32)
            quad[:, 0] = quad[:, 0].clip(0, w - 1)
            quad[:, 1] = quad[:, 1].clip(0, h - 1)
            out.append((quad, score))
        return out

    # ---- recognition ----------------------------------------------------
    def recognise(self, bgr: np.ndarray, quads: list[np.ndarray]) -> list[tuple[str, float, list]]:
        """For each quad: (text, confidence, [(word, x0, x1) along the crop 0-1])."""
        pil = Image.fromarray(bgr)
        crops = []
        for q in quads:
            cw = max(1, int(round(np.linalg.norm(q[1] - q[0]))))
            ch = max(1, int(round(np.linalg.norm(q[3] - q[0]))))
            # QUAD takes upper-left, lower-left, lower-right, upper-right.
            data = tuple(float(v) for v in (*q[0], *q[3], *q[2], *q[1]))
            crop = pil.transform((cw, ch), Image.QUAD, data, Image.BICUBIC)
            crops.append(crop)
        results: list = [None] * len(crops)
        order = sorted(range(len(crops)), key=lambda i: crops[i].width / crops[i].height)
        for b in range(0, len(order), REC_BATCH):
            idx = order[b:b + REC_BATCH]
            widths = [min(REC_MAX_WIDTH, max(1, int(math.ceil(REC_HEIGHT * crops[i].width
                                                              / crops[i].height)))) for i in idx]
            img_w = max(max(widths), int(REC_HEIGHT * 320 / 48))
            batch = np.zeros((len(idx), 3, REC_HEIGHT, img_w), np.float32)
            for k, (i, rw) in enumerate(zip(idx, widths)):
                arr = np.asarray(crops[i].resize((rw, REC_HEIGHT), Image.BILINEAR), np.float32)
                batch[k, :, :, :rw] = ((arr / 255.0 - 0.5) / 0.5).transpose(2, 0, 1)
            probs = self.rec.run(None, {self.rec.get_inputs()[0].name: batch})[0]
            for k, i in enumerate(idx):
                results[i] = self._decode(probs[k], widths[k] / img_w)
        return results

    def _decode(self, probs: np.ndarray, filled: float) -> tuple[str, float, list]:
        """Greedy CTC decode. `filled` is the share of the input width the crop
        occupied (the rest is padding), to place characters on the crop."""
        steps = probs.shape[0]
        best, conf = probs.argmax(axis=1), probs.max(axis=1)
        chars: list[tuple[str, int, float]] = []
        prev = -1
        for t, (c, p) in enumerate(zip(best.tolist(), conf.tolist())):
            if c != 0 and c != prev and c < len(self.charset):
                chars.append((self.charset[c], t, p))
            prev = c
        if not chars:
            return "", 0.0, []
        text = "".join(c for c, _, _ in chars)
        score = float(np.mean([p for _, _, p in chars]))
        # Words: runs of non-space characters, each spanning its time steps
        # (half a step of margin either side), as a share of the crop.
        to_crop = lambda t: min(1.0, max(0.0, (t / steps) / filled))
        words, cur = [], []
        for c, t, _ in chars + [(" ", steps, 0.0)]:
            if c == " ":
                if cur:
                    words.append(("".join(ch for ch, _ in cur),
                                  to_crop(cur[0][1] - 0.5), to_crop(cur[-1][1] + 1.5)))
                cur = []
            else:
                cur.append((c, t))
        return text.strip(), score, words

    # ---- a page ---------------------------------------------------------
    def read(self, bgr: np.ndarray) -> tuple[list[dict], float]:
        """OCR one page image. Returns (words with 0-1 boxes, page confidence).

        Page confidence is the recognition score averaged over the text area
        it covers, so a block of script the recogniser cannot write (which
        it still detects, and reads as low-scoring nonsense) pulls the page
        down in proportion to its size. A page with no text at all is
        confidently empty only if it is blank to the eye."""
        h, w = bgr.shape[:2]
        regions = self.detect(bgr)
        if not regions:
            return [], (1.0 if float(np.asarray(bgr, np.float32).std()) < 8.0 else 0.0)
        # Reading order: top to bottom, then left to right.
        regions.sort(key=lambda r: (round(float(r[0][:, 1].mean()) / max(h * 0.008, 1)),
                                    float(r[0][:, 0].min())))
        read = self.recognise(bgr, [q for q, _ in regions])
        words: list[dict] = []
        area_sum = weighted = 0.0
        line_id = 0
        for (quad, _), (text, score, spans) in zip(regions, read):
            area = float(np.linalg.norm(quad[1] - quad[0]) * np.linalg.norm(quad[3] - quad[0]))
            area_sum += area
            # A region read this badly was not read: most often a script the
            # recogniser does not have. It counts as nothing, not as half.
            weighted += area * (score if score >= UNREADABLE else 0.0)
            if not text or score < DROP_SCORE:
                continue
            # The detector's box runs well above and below the ink; trim it to
            # about the glyph box, as measured against PDFium's on rendered
            # digital pages (tests/test_paddle.py pins it).
            top = quad[0] + TRIM_TOP * (quad[3] - quad[0])
            right_top = quad[1] + TRIM_TOP * (quad[2] - quad[1])
            bottom = quad[3] - TRIM_BOTTOM * (quad[3] - quad[0])
            right_bottom = quad[2] - TRIM_BOTTOM * (quad[2] - quad[1])
            for word, a, b in spans:
                pts = np.array([top + a * (right_top - top), top + b * (right_top - top),
                                bottom + b * (right_bottom - bottom), bottom + a * (right_bottom - bottom)])
                words.append({"text": word, "x0": max(0.0, float(pts[:, 0].min()) / w),
                              "y0": max(0.0, float(pts[:, 1].min()) / h),
                              "x1": min(1.0, float(pts[:, 0].max()) / w),
                              "y1": min(1.0, float(pts[:, 1].max()) / h),
                              "line_id": line_id, "conf": round(score, 4)})
            line_id += 1
        assign_blocks(words)
        return words, (weighted / area_sum if area_sum else 0.0)


def assign_blocks(words: list[dict]) -> None:
    """Group OCR lines into blocks (paragraphs, headings). Detected boxes are
    padded and touch their neighbours, so gaps between boxes say little; the
    distance between line centres does. A new block starts where that
    distance is well over the page's usual line pitch, where the text jumps
    back up (a new column), where the left edge moves, or after a heading: a
    short line that does not end a sentence."""
    lines: dict[int, list[dict]] = {}
    for wd in words:
        lines.setdefault(wd["line_id"], []).append(wd)
    geo = {lid: ((min(w["y0"] for w in ws) + max(w["y1"] for w in ws)) / 2,
                 min(w["x0"] for w in ws), max(w["y1"] for w in ws) - min(w["y0"] for w in ws))
           for lid, ws in lines.items()}
    order = sorted(geo)
    steps = [geo[b][0] - geo[a][0] for a, b in zip(order, order[1:])
             if 0 < geo[b][0] - geo[a][0] < 3 * max(geo[a][2], geo[b][2])]
    pitch = float(np.median(steps)) if steps else 0.0
    rights = {lid: max(w["x1"] for w in ws) for lid, ws in lines.items()}
    body_right = max(rights.values(), default=1.0)
    block, prev, heading = -1, None, False
    for lid in order:
        centre, left, height = geo[lid]
        if (prev is None or heading or centre < prev[0] - 0.5 * height
                or centre - prev[0] > max(BLOCK_PITCH * pitch, 1.2 * max(height, prev[2]))
                or abs(left - prev[1]) > 0.25):
            block += 1
        for wd in lines[lid]:
            wd["block_id"] = block
        last = max(lines[lid], key=lambda w: w["x1"])["text"]
        heading = (rights[lid] - left < 0.6 * (body_right - left)
                   and not last.rstrip().endswith((".", ",", ";", ":", "-", "।")))
        prev = (centre, left, height)


def _runs(bitmap: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Horizontal runs of set pixels: (row, start, end exclusive), row-major."""
    padded = np.zeros((bitmap.shape[0], bitmap.shape[1] + 2), np.int8)
    padded[:, 1:-1] = bitmap
    d = np.diff(padded, axis=1)
    rows, starts = np.nonzero(d == 1)
    _, ends = np.nonzero(d == -1)
    return rows, starts, ends


def _label(rows: np.ndarray, starts: np.ndarray, ends: np.ndarray) -> np.ndarray:
    """Connected components over runs (4-connectivity): a label per run."""
    n = len(rows)
    parent = list(range(n))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    bounds = np.searchsorted(rows, np.arange(rows.max() + 2)) if n else np.zeros(1, int)
    s_l, e_l = starts.tolist(), ends.tolist()
    for r in range(1, len(bounds) - 1):
        a, b = bounds[r], bounds[r + 1]
        pa, pb = bounds[r - 1], bounds[r]
        if a == b or pa == pb:
            continue
        j = pa
        for i in range(a, b):
            while j < pb and e_l[j] <= s_l[i]:
                j += 1
            k = j
            while k < pb and s_l[k] < e_l[i]:
                ri, rk = find(i), find(k)
                if ri != rk:
                    parent[max(ri, rk)] = min(ri, rk)
                k += 1
    return np.array([find(i) for i in range(n)], np.int64)


def _regions(prob: np.ndarray) -> list[tuple[np.ndarray, float]]:
    """DB post-processing: text regions as rotated quads (tl, tr, br, bl) in
    probability-map pixels, with their mean probability."""
    bitmap = prob > DET_THRESH
    # A 2x2 dilation, as PaddleOCR does: closes hairline gaps inside a word.
    grown = bitmap.copy()
    grown[1:, :] |= bitmap[:-1, :]
    grown[:, 1:] |= bitmap[:, :-1]
    grown[1:, 1:] |= bitmap[:-1, :-1]
    bitmap = grown
    rows, starts, ends = _runs(bitmap)
    if not len(rows):
        return []
    labels = _label(rows, starts, ends)
    order = np.argsort(labels, kind="stable")
    labels, rows, starts, ends = labels[order], rows[order], starts[order], ends[order]
    cuts = np.flatnonzero(np.diff(labels)) + 1
    groups = np.split(np.arange(len(labels)), cuts)
    csum = np.zeros((prob.shape[0], prob.shape[1] + 1), np.float64)
    np.cumsum(prob, axis=1, out=csum[:, 1:])
    y = rows.astype(np.float64)
    s, e = starts.astype(np.float64), ends.astype(np.float64) - 1      # inclusive end
    n = e - s + 1
    psum = csum[rows, ends] - csum[rows, starts]
    sx = n * (s + e) / 2
    sxx = (e * (e + 1) * (2 * e + 1) - (s - 1) * s * (2 * s - 1)) / 6
    out = []
    for g in groups:
        cnt = n[g].sum()
        if cnt < MIN_SIZE * MIN_SIZE:
            continue
        score = float(psum[g].sum() / cnt)
        if score < BOX_THRESH:
            continue
        mx, my = sx[g].sum() / cnt, (n[g] * y[g]).sum() / cnt
        cxx = sxx[g].sum() / cnt - mx * mx
        cyy = (n[g] * y[g] ** 2).sum() / cnt - my * my
        cxy = (y[g] * sx[g]).sum() / cnt - mx * my
        angle = 0.5 * math.atan2(2 * cxy, cxx - cyy)
        if abs(math.degrees(angle)) > MAX_TILT_DEG:
            angle = 0.0                  # a blob, not a line: take it upright
        c, si = math.cos(angle), math.sin(angle)
        # Extents along the line (u) and across it (v), from run endpoints.
        pu = np.concatenate([s[g] * c + y[g] * si, e[g] * c + y[g] * si])
        pv = np.concatenate([-s[g] * si + y[g] * c, -e[g] * si + y[g] * c])
        # Through pixel centres, as a contour polygon runs (the unclip distance
        # is defined on that polygon).
        u0, u1, v0, v1 = pu.min(), pu.max(), pv.min(), pv.max()
        bw, bh = u1 - u0, v1 - v0
        if min(bw, bh) < MIN_SIZE:
            continue
        d = bw * bh * UNCLIP_RATIO / (2 * (bw + bh))
        u0, u1, v0, v1 = u0 - d, u1 + d, v0 - d, v1 + d
        if min(u1 - u0, v1 - v0) < MIN_SIZE + 2:
            continue
        back = lambda u, v: (u * c - v * si, u * si + v * c)
        quad = np.array([back(u0, v0), back(u1, v0), back(u1, v1), back(u0, v1)], np.float32)
        out.append((quad, score))
    return out


_lock = threading.Lock()
_state: dict = {}


def engine() -> PaddleOCR | None:
    """The loaded models, or None when they are not provisioned. Loaded once;
    a failure is remembered, so it is logged once, not once per page."""
    if "engine" in _state:
        return _state["engine"]
    with _lock:
        if "engine" not in _state:
            try:
                _state["engine"] = PaddleOCR(model_dir())
                log.info("PaddleOCR rung ready: %s", _state["engine"].name)
            except Unavailable as exc:
                log.warning("PaddleOCR rung unavailable — %s", exc)
                _state["engine"] = None
            except Exception as exc:           # noqa: BLE001 — a broken model must not break reading
                log.warning("PaddleOCR rung failed to load — %s", type(exc).__name__)
                _state["engine"] = None
    return _state["engine"]
