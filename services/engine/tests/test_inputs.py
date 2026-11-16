"""What goes in: the PDFium reader (words, lines, blocks, rotation) and photos."""
import tempfile
import threading
import unittest
import unicodedata
from pathlib import Path

import io

from PIL import Image

from dueproof_engine.pipeline import pdf
from dueproof_engine.pipeline.analyze import analyze
from dueproof_engine.pipeline.link import build_index, link_quote
from dueproof_engine.pipeline.read import ReadError, read_document, read_image
from tests.fixtures import CIRCULAR, FOLDER, SCAN
from tests.pdfgen import pdf as make
from tests.support import paddle_present, tesseract_present

TEXT = ("Subject: Rotation test\n\nThe registry shall file the return on or before 14 March 2027 "
        "and the clerk must acknowledge receipt within seven days of this notice.\n\n"
        "A second paragraph follows here with enough ordinary words to make a block of its own.")


def tmp_pdf(data: bytes) -> Path:
    path = Path(tempfile.mkdtemp()) / "t.pdf"
    path.write_bytes(data)
    return path


class Words(unittest.TestCase):
    def test_words_lines_and_blocks(self):
        doc = pdf.open_pdf(tmp_pdf(make([TEXT])))
        words = pdf.words(doc[0])
        self.assertEqual(" ".join(w["text"] for w in words[:3]), "Subject: Rotation test")
        self.assertIn("2027", [w["text"] for w in words])
        blocks = sorted({w["block_id"] for w in words})
        self.assertEqual(len(blocks), 3)                 # subject, two paragraphs
        for w in words:
            self.assertTrue(0 <= w["x0"] < w["x1"] <= 1 and 0 <= w["y0"] < w["y1"] <= 1, w)
        # Lines run top to bottom, and words within a line left to right.
        lines = {}
        for w in words:
            lines.setdefault(w["line_id"], []).append(w)
        tops = [min(w["y0"] for w in ws) for _, ws in sorted(lines.items())]
        self.assertEqual(tops, sorted(tops))
        for ws in lines.values():
            self.assertEqual([w["x0"] for w in ws], sorted(w["x0"] for w in ws))

    def test_boxes_sit_on_the_ink_whatever_the_rotation(self):
        """Every word box, drawn on the rendered page, must cover dark pixels —
        including on pages carrying /Rotate."""
        for rotate in (0, 90, 180, 270):
            with self.subTest(rotate=rotate):
                doc = pdf.open_pdf(tmp_pdf(make([TEXT], rotate=rotate)))
                img = pdf.render(doc[0], 144).mean(axis=2)
                h, w = img.shape
                if rotate in (90, 270):
                    self.assertGreater(w, h)
                words = pdf.words(doc[0])
                self.assertGreater(len(words), 30)
                for word in words:
                    patch = img[int(word["y0"] * h):int(word["y1"] * h) + 1,
                                int(word["x0"] * w):int(word["x1"] * w) + 1]
                    self.assertLess(patch.min(), 100, (rotate, word["text"]))

    def test_combining_marks_never_start_a_word(self):
        doc = pdf.open_pdf(FOLDER / CIRCULAR)
        for n in range(len(doc)):
            for w in pdf.words(doc[n]):
                self.assertNotEqual(unicodedata.category(w["text"][0])[0], "M", w["text"])

    def test_a_page_without_a_text_layer_has_no_words(self):
        doc = pdf.open_pdf(FOLDER / SCAN)
        self.assertEqual(pdf.words(doc[0]), [])


class Threads(unittest.TestCase):
    def test_concurrent_reads(self):
        """PDFium is not thread-safe. Unlocked, parallel reads fail to load
        pages or segfault the process in its glyph cache, and the ingest
        workers read in parallel."""
        files = [f for f in sorted(FOLDER.glob("*.pdf")) if not f.name.startswith("edge-")]
        errors = []

        def read():
            try:
                for _ in range(5):
                    for path in files:
                        doc = pdf.open_pdf(path)
                        try:
                            with pdf.LOCK:
                                n = len(doc)
                            for i in range(n):
                                with pdf.LOCK:
                                    page = doc[i]
                                pdf.render(page, 150)
                                pdf.words(page)
                                with pdf.LOCK:
                                    page.close()
                        finally:
                            with pdf.LOCK:
                                doc.close()
            except Exception as exc:
                errors.append(exc)

        threads = [threading.Thread(target=read) for _ in range(6)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(errors, [])


@unittest.skipUnless(paddle_present() or tesseract_present(), "no OCR rung installed")
class Photos(unittest.TestCase):
    """A phone photo of a notice, as JPEG, PNG or multi-page TIFF."""
    @classmethod
    def setUpClass(cls):
        doc = pdf.open_pdf(FOLDER / SCAN)
        cls.pages = [Image.fromarray(pdf.render(doc[n], 200)[:, :, ::-1]) for n in range(len(doc))]

    def encoded(self, fmt: str, page: int = 0) -> bytes:
        out = io.BytesIO()
        self.pages[page].save(out, format=fmt)
        return out.getvalue()

    def test_jpeg_and_png_are_read_by_ocr(self):
        for fmt in ("JPEG", "PNG"):
            with self.subTest(fmt=fmt):
                doc = read_document(self.encoded(fmt, 0))
                self.assertEqual((doc["text_source"], doc["page_count"]), ("ocr", 1))
                self.assertIn(doc["pages"][0]["engine"], ("paddleocr", "tesseract"))
                found = analyze(doc["page_texts"], "notice-photo")
                self.assertTrue(any(o["due_date"] == "2026-08-21" for o in found["obligations"]))
                index = build_index({1: doc["words"]})
                for f in found["obligations"] + found["summary"]:
                    hit = link_quote(f["evidence_quote"], index, 1)
                    self.assertEqual(hit["confidence"] == "none", not hit["rects"])

    def test_a_multi_page_tiff_is_one_document(self):
        out = io.BytesIO()
        self.pages[0].save(out, format="TIFF", save_all=True, append_images=self.pages[1:])
        result = read_image(out.getvalue())
        self.assertEqual(result["page_count"], len(self.pages))
        self.assertEqual(result["text_source"], "ocr")
        self.assertIn("2026", result["full_text"])

    def test_a_huge_photo_is_scaled_not_refused(self):
        big = self.pages[0].resize((self.pages[0].width * 4, self.pages[0].height * 4))  # ~60 MP
        out = io.BytesIO()
        big.save(out, format="PNG", compress_level=1)
        shown = []
        result = read_image(out.getvalue(), max_rung="text_layer",
                            on_image=lambda n, img: shown.append(img.shape))
        self.assertEqual(result["page_count"], 1)
        self.assertEqual((result["pages"][0]["width"], result["pages"][0]["height"]),
                         (float(big.width), float(big.height)))
        self.assertLessEqual(max(shown[0][:2]), 1700)

    def test_exif_orientation_is_applied(self):
        out = io.BytesIO()
        exif = Image.Exif()
        exif[0x0112] = 6                                  # rotate 90 CW to display
        self.pages[0].save(out, format="JPEG", exif=exif)
        result = read_image(out.getvalue(), max_rung="text_layer")
        self.assertEqual((result["pages"][0]["width"], result["pages"][0]["height"]),
                         (float(self.pages[0].height), float(self.pages[0].width)))


class Refusals(unittest.TestCase):
    def test_a_broken_image_fails_cleanly(self):
        with self.assertRaises(ReadError) as caught:
            read_document(b"\xff\xd8\xff\xe0 not really a jpeg" + bytes(64))
        self.assertEqual(caught.exception.reason, "malformed")
        self.assertIn("could not be read as an image", str(caught.exception))

    def test_other_files_are_refused(self):
        for body in (b"GIF89a....", b"PK\x03\x04", b"hello"):
            with self.subTest(body=body), self.assertRaises(ReadError) as caught:
                read_document(body)
            self.assertEqual(caught.exception.reason, "unsupported")

    def test_a_decompression_bomb_is_refused_before_decoding(self):
        out = io.BytesIO()
        Image.new("1", (20000, 20000)).save(out, format="PNG")    # 400 MP, a few KB
        with self.assertRaises(ReadError) as caught:
            read_document(out.getvalue())
        self.assertEqual(caught.exception.reason, "too_large")

    def test_a_blank_page_is_confidently_empty(self):
        out = io.BytesIO()
        Image.new("RGB", (800, 1100), "white").save(out, format="PNG")
        page = read_document(out.getvalue())["pages"][0]
        self.assertEqual((page["words"], page["confidence"], page["escalate"]), ([], 1.0, False))


if __name__ == "__main__":
    unittest.main()
