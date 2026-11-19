"""The PDFium sandbox (pipeline/sandbox.py) and the hardening around it:
broken pages, a heavy document beside a light one, the WebP size limit
and odd image modes."""
import io
import threading
import time
import unittest
from unittest import mock

import numpy as np
from PIL import Image, ImageDraw

from dueproof_engine.pipeline import read, sandbox
from tests.fixtures import FOLDER, INVOICE
from tests.pdfgen import pdf as make_pdf
from tests.storage_server import StorageServer
from tests.support import token
from tests.test_fuzz_pdf_bombs import CATALOG, SELF_FORM, _build, _stream

TEXT = b"BT /F1 11 Tf 72 700 Td (" + b"notice " * 40 + b") Tj ET"
PAGE = b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>"
FONT = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
# Page 1 is fine; "page 2" is a page-tree node that lists itself.
def _client():
    """A client with a fresh token (the shared one may have expired by the
    time a long suite gets here)."""
    from fastapi.testclient import TestClient
    from dueproof_engine.app import app
    return TestClient(app, raise_server_exceptions=False, headers={"Authorization": f"Bearer {token()}"})


ONE_BROKEN = _build([CATALOG, b"<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>", PAGE, _stream(TEXT), FONT,
                     b"<< /Type /Pages /Parent 2 0 R /Kids [6 0 R] /Count 1 >>"])


class Sandbox(unittest.TestCase):
    def test_a_document_that_exhausts_the_child_is_too_large_and_the_next_one_reads(self):
        with self.assertRaises(read.ReadError) as c:
            read.read_document(SELF_FORM, max_rung="text_layer")
        self.assertEqual(c.exception.reason, "too_large")
        doc = read.read_document((FOLDER / INVOICE).read_bytes(), max_rung="text_layer")
        self.assertEqual(doc["pages"][0]["engine"], "text_layer")

    def test_a_call_over_its_time_ends_the_child(self):
        with sandbox.Sandbox(call_seconds=1) as sb:
            sb.call("open", SELF_FORM, None)
            t0 = time.monotonic()
            with self.assertRaises(read.ReadError) as c:
                sb.call("page", 0, None)
            self.assertEqual(c.exception.reason, "too_large")
            self.assertLess(time.monotonic() - t0, 10)
            with self.assertRaises(read.ReadError):             # the child is gone for good
                sb.call("page", 0, None)

    def test_a_heavy_document_does_not_hold_up_a_light_one(self):
        """Before the sandbox, every PDF request waited on one process-wide
        PDFium lock: an innocent inspect took 55 s behind a text bomb."""
        heavy = threading.Thread(target=lambda: self.assertRaises(
            read.ReadError, read.read_document, SELF_FORM, max_rung="text_layer"))
        heavy.start()
        try:
            time.sleep(0.5)                                     # the bomb is in PDFium now
            t0 = time.monotonic()
            got = read.inspect_document((FOLDER / INVOICE).read_bytes())
            self.assertLess(time.monotonic() - t0, 3.0)
            self.assertEqual(got["text_layer_pages"], [1])
        finally:
            heavy.join()

    def test_off_runs_the_same_code_in_process(self):
        with mock.patch.object(sandbox.config, "SANDBOX", "off"):
            got = read.inspect_document((FOLDER / INVOICE).read_bytes())
        self.assertEqual((got["pages"], got["text_layer_pages"]), (1, [1]))

    def test_the_fork_server_is_restarted_if_it_dies(self):
        sandbox.warm()
        sandbox._SERVER.proc.kill()
        sandbox._SERVER.proc.wait()
        got = read.inspect_document((FOLDER / INVOICE).read_bytes())
        self.assertEqual(got["text_layer_pages"], [1])


class BrokenPages(unittest.TestCase):
    def test_a_page_that_will_not_load_is_kept_empty_and_escalated(self):
        doc = read.read_document(ONE_BROKEN, max_rung="text_layer")
        self.assertEqual(doc["page_count"], 2)
        first, second = doc["pages"]
        self.assertIn("notice", first["text"])
        self.assertEqual((second["words"], second["engine"], second["escalate"]), ([], "none", True))
        self.assertEqual(doc["needs_escalation"], [2])
        self.assertEqual(read.inspect_document(ONE_BROKEN)["text_layer_pages"], [1])


class TallPages(unittest.TestCase):
    def test_a_page_taller_than_webp_allows_is_still_read(self):
        tall = make_pdf(["The registry shall file the return on or before 14 March 2027. " * 40],
                        size=(200, 9000))
        with StorageServer(FOLDER) as storage:
            storage.extra["tall.pdf"] = tall
            r = _client().post("/v1/read", json={"sourceUrl": storage.url("tall.pdf"), "mime": "application/pdf",
                                                "pageImagePutUrls": [storage.url("img/tall/1.webp")],
                                                "maxRung": "text_layer"})
            self.assertEqual(r.status_code, 200, r.text[:200])
            image = Image.open(io.BytesIO(storage.stored["img/tall/1.webp"][1]))
        self.assertLessEqual(max(image.size), 16383)


class ImageModes(unittest.TestCase):
    def _page(self, img: Image.Image) -> dict:
        out = io.BytesIO()
        img.save(out, format="PNG")
        return read.read_document(out.getvalue(), max_rung="text_layer")["pages"][0]

    def _ink(self) -> Image.Image:
        img = Image.new("L", (800, 600), 255)
        d = ImageDraw.Draw(img)
        for i in range(12):
            d.text((40, 40 + i * 40), "Reply within 30 days of this notice", fill=0)
        return img

    def test_text_drawn_only_in_the_alpha_channel_is_not_a_blank_page(self):
        alpha = Image.eval(self._ink(), lambda v: 255 - v)         # ink opaque, paper transparent
        rgba = Image.merge("RGBA", (Image.new("L", alpha.size, 0),) * 3 + (alpha,))
        self.assertTrue(self._page(rgba)["escalate"])

    def test_a_blank_16_bit_page_is_still_blank(self):
        flat = Image.fromarray(np.full((600, 800), 40000, np.uint16))
        page = self._page(flat)
        self.assertEqual((page["engine"], page["escalate"]), ("none", False))

    def test_an_8_bit_range_in_a_32_bit_image_is_unchanged(self):
        arr = np.asarray(self._ink(), np.int32)
        self.assertTrue(np.array_equal(np.asarray(read._to_rgb(Image.fromarray(arr)))[:, :, 0],
                                       arr.astype(np.uint8)))

    def test_inspect_counts_frames_without_decoding_them(self):
        frame = Image.new("1", (1654, 2339), 1)
        out = io.BytesIO()
        frame.save(out, format="TIFF", compression="group4", save_all=True, append_images=[frame] * 9)
        with mock.patch.object(read, "_to_rgb", side_effect=AssertionError("decoded")):
            got = read.inspect_document(out.getvalue())
        self.assertEqual(got["pages"], 10)


if __name__ == "__main__":
    unittest.main()
