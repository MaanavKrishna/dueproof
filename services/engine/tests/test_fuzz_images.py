"""Fuzz findings on image uploads (JPEG/PNG/TIFF).

1. image_frames() decodes every frame of a multi-frame PNG (APNG) or TIFF
   into memory before anything else happens, and /v1/inspect calls it just
   to count pages. The per-frame cap (MAX_IMAGE_PIXELS) is not a document
   cap: 40 frames of 64 MP in a 3 MB file needs more than 6 GB. A Vercel
   function has 2 GB. Expected: a total-pixel budget for the document, frames
   decoded one at a time, and inspect counting frames without decoding them.
2. A 1 x 100,000,000 PNG (12 kB) raises MemoryError inside Pillow, which is
   not caught: a 500 instead of ReadError("too_large").
3. A multi-page TIFF whose second IFD has no ImageWidth makes Pillow raise
   TypeError("Missing dimensions") on seek; image_frames() catches OSError,
   ValueError, SyntaxError and EOFError only, so /v1/inspect and /v1/read
   answer 500. 467 of 3000 mutated TIFFs hit this.
4. A 16-bit greyscale scan (mode I;16) is clipped to white by
   convert("RGB"), so the page is reported blank with confidence 1.0 and is
   NOT escalated: the text silently disappears. Expected: the image is scaled
   to 8 bits first, so the page is either read or escalated.

The memory tests run the engine in a child process limited to 2 GiB of
address space (the Vercel function's memory), so a failure is a clean
assertion, not an OOM kill of the test runner."""
import io
import json
import os
import subprocess
import shutil
import sys
import tempfile
import textwrap
import unittest

import numpy as np
from PIL import Image, ImageDraw

from dueproof_engine.pipeline import read

ENGINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIMIT = 2 << 30


def _in_child(code: str, timeout: int = 120) -> dict:
    """Run `code` (which sets `result`) in a fresh interpreter under RLIMIT_AS."""
    prog = textwrap.dedent(f"""
        import json, resource, sys
        resource.setrlimit(resource.RLIMIT_AS, ({LIMIT}, {LIMIT}))
        try:
            from dueproof_engine.pipeline.read import ReadError
        except Exception as e:
            print(json.dumps({{"result": "import", "error": repr(e)}})); sys.exit()
        try:
    """) + textwrap.indent(textwrap.dedent(code), "    ") + textwrap.dedent("""
        except ReadError as e:
            result = {"result": "ReadError", "reason": e.reason}
        except BaseException as e:
            result = {"result": "crash", "error": type(e).__name__}
        print(json.dumps(result))
    """)
    p = subprocess.run([sys.executable, "-c", prog], cwd=ENGINE, capture_output=True, text=True, timeout=timeout)
    lines = [l for l in p.stdout.splitlines() if l.startswith("{")]
    return json.loads(lines[-1]) if lines else {"result": "died", "rc": p.returncode, "stderr": p.stderr[-300:]}


def _multi_frame(fmt: str, frames: int, side: int) -> bytes:
    page = Image.new("1", (side, side), 1)
    out = io.BytesIO()
    if fmt == "TIFF":
        page.save(out, format="TIFF", compression="group4", save_all=True, append_images=[page] * (frames - 1))
    else:
        page = page.convert("L")
        page.save(out, format="PNG", save_all=True, append_images=[page] * (frames - 1), default_image=False)
    return out.getvalue()


class FrameBombs(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.mkdtemp(prefix="dueproof-fuzz-")
        for fmt in ("TIFF", "PNG"):
            with open(os.path.join(cls.dir, f"bomb.{fmt.lower()}"), "wb") as f:
                f.write(_multi_frame(fmt, 40, 8000))          # 40 x 64 MP, ~3 MB as PNG, 0.2 MB as TIFF

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.dir, ignore_errors=True)

    def test_inspect_counts_frames_within_2_gib(self):
        for ext in ("tiff", "png"):
            with self.subTest(ext=ext):
                got = _in_child(f"""
                    from unittest import mock
                    from dueproof_engine.api import service, storage, models as m
                    data = open({os.path.join(self.dir, 'bomb.' + ext)!r}, "rb").read()
                    with mock.patch.object(storage, "fetch", return_value=data):
                        r = service.inspect(m.InspectRequest(sourceUrl="http://s/x", mime="image/{ext}"))
                    result = {{"result": "ok", "ok": r.ok, "reason": r.reason, "pages": r.pageCount}}
                """)
                self.assertIn(got["result"], ("ok", "ReadError"), got)

    def test_read_refuses_a_document_over_the_pixel_budget(self):
        for ext in ("tiff", "png"):
            with self.subTest(ext=ext):
                got = _in_child(f"""
                    from dueproof_engine.pipeline import read
                    data = open({os.path.join(self.dir, 'bomb.' + ext)!r}, "rb").read()
                    read.read_document(data, max_rung="text_layer")
                    result = {{"result": "ok"}}
                """)
                self.assertEqual(got, {"result": "ReadError", "reason": "too_large"})


class OddImages(unittest.TestCase):
    def test_an_extreme_aspect_ratio_is_refused_cleanly(self):
        out = io.BytesIO()
        Image.new("1", (100_000_000, 1), 1).save(out, format="PNG")      # 12 kB
        with self.assertRaises(read.ReadError) as c:                     # today: MemoryError
            read.read_document(out.getvalue(), max_rung="text_layer")
        self.assertEqual(c.exception.reason, "too_large")

    def test_a_frame_without_dimensions_is_malformed(self):
        import struct
        out = io.BytesIO()
        frame = Image.new("L", (10, 10))
        frame.save(out, format="TIFF", save_all=True, append_images=[frame])
        d = bytearray(out.getvalue())
        first = struct.unpack("<I", d[4:8])[0]
        n = struct.unpack("<H", d[first:first + 2])[0]
        second = struct.unpack("<I", d[first + 2 + 12 * n:first + 6 + 12 * n])[0]
        for i in range(struct.unpack("<H", d[second:second + 2])[0]):
            entry = second + 2 + 12 * i
            if struct.unpack("<H", d[entry:entry + 2])[0] == 256:          # ImageWidth -> an unknown tag
                d[entry:entry + 2] = struct.pack("<H", 0xFFF0)
        with self.assertRaises(read.ReadError) as c:                       # today: TypeError
            read.read_document(bytes(d), max_rung="text_layer")
        self.assertEqual(c.exception.reason, "malformed")

    def test_a_16_bit_scan_is_not_reported_as_a_blank_page(self):
        img = Image.new("L", (1200, 1600), 255)
        d = ImageDraw.Draw(img)
        for i in range(30):
            d.text((60, 60 + i * 40), f"The registry shall file the return on or before 14 March 2027, line {i}", fill=0)
        sixteen = Image.fromarray(np.asarray(img, np.uint16) * 257)        # full 16-bit range, mode I;16
        out = io.BytesIO()
        sixteen.save(out, format="PNG")
        page = read.read_document(out.getvalue(), max_rung="text_layer")["pages"][0]
        # With no OCR allowed, a page with ink must be escalated; a blank one is not.
        self.assertTrue(page["escalate"], "a 16-bit scan was clipped to white and reported as confidently empty")


if __name__ == "__main__":
    unittest.main()
