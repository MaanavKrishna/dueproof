"""Provision the PaddleOCR models for the engine's OCR rung 2. Run once, by
hand or in a build step, on a machine with network access:

    uv run python scripts/fetch_ocr_models.py [--dest models/ppocr]

What it fetches: the PP-OCR detection and recognition models in ONNX form, as
RapidOCR publishes them inside its wheel on PyPI (rapidocr 3.10.0). Only the
.onnx files and the licence texts are extracted; none of RapidOCR's code is
installed or run. Every file is checked against the SHA-256 pinned below
(the wheel against PyPI's digest, the models against RapidOCR's
MODEL_LICENSES.md), so a changed upstream file is refused, not used.

Licences: RapidOCR's code and the model files are Apache-2.0; the model
weights are Baidu's / PaddleOCR's (Apache-2.0). The licence and attribution
files are copied next to the models; see also the repository's NOTICE.

Why PP-OCRv6 small and not PP-OCRv5: RapidOCR 3.10's wheel ships PP-OCRv6
small (the successor of v5, same det/rec architecture and the same ONNX
interface). PP-OCRv5's per-script recognisers (devanagari, ta, te, ...) are
only on ModelScope, which this build could not reach; ocr/paddle.py loads
any PP-OCR det/rec ONNX pair, so they drop in later (--det/--rec below).
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import sys
import urllib.request
import zipfile
from pathlib import Path

WHEEL = ("rapidocr", "3.10.0", "rapidocr-3.10.0-py3-none-any.whl")
FILES = {   # path in the wheel -> (name on disk, sha256)
    "rapidocr/models/PP-OCRv6_det_small.onnx":
        ("PP-OCRv6_det_small.onnx", "090f04abcd9d9a7498bc4ebf677e4cb9bdce1fe4197ddb7e529f1ef44e1ff94f"),
    "rapidocr/models/PP-OCRv6_rec_small.onnx":
        ("PP-OCRv6_rec_small.onnx", "6f327246b50388f3c176ae304bd95767ea6dc0c9ae92153ef8cbe210b3c14884"),
}
LICENCES = ("rapidocr-3.10.0.dist-info/licenses/LICENSE",
            "rapidocr-3.10.0.dist-info/licenses/MODEL_LICENSES.md")
DEFAULT_DEST = Path(__file__).resolve().parent.parent / "models" / "ppocr"


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _wheel() -> bytes:
    name, version, filename = WHEEL
    with urllib.request.urlopen(f"https://pypi.org/pypi/{name}/{version}/json", timeout=60) as r:
        meta = json.load(r)
    entry = next(u for u in meta["urls"] if u["filename"] == filename)
    with urllib.request.urlopen(entry["url"], timeout=300) as r:
        data = r.read()
    if _sha256(data) != entry["digests"]["sha256"]:
        raise SystemExit(f"{filename}: SHA-256 does not match PyPI's; refusing it")
    return data


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--dest", type=Path, default=DEFAULT_DEST)
    args = p.parse_args(argv)
    dest: Path = args.dest
    if all((dest / disk).is_file() and _sha256((dest / disk).read_bytes()) == want
           for disk, want in FILES.values()):
        print(f"models already in {dest}, verified")
        return 0
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(_wheel())) as z:
        for inner, (disk, want) in FILES.items():
            data = z.read(inner)
            if _sha256(data) != want:
                raise SystemExit(f"{disk}: SHA-256 does not match the pinned value; refusing it")
            (dest / disk).write_bytes(data)
        for inner in LICENCES:
            (dest / Path(inner).name).write_bytes(z.read(inner))
    print(f"{len(FILES)} models verified in {dest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
