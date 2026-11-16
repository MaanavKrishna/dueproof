"""What goes in: the PDFium reader (words, lines, blocks, rotation) and photos."""
import tempfile
import threading
import unittest
import unicodedata
from pathlib import Path

import cv2

from dueproof import config
from dueproof.pipeline import pdf
from dueproof.pipeline.read import read_image
from tests.fixtures import CIRCULAR, FOLDER, SCAN
from tests.pdfgen import pdf as make
from tests.support import client, upload, wait_done

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
                img = cv2.cvtColor(pdf.render(doc[0], 144), cv2.COLOR_BGR2GRAY)
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


class Photos(unittest.TestCase):
    """A phone photo of a notice, as JPEG, PNG or multi-page TIFF."""
    @classmethod
    def setUpClass(cls):
        doc = pdf.open_pdf(FOLDER / SCAN)
        cls.pages = [pdf.render(doc[n], 200) for n in range(len(doc))]

    def encoded(self, ext: str, page: int = 0) -> bytes:
        ok, data = cv2.imencode(ext, self.pages[page])
        self.assertTrue(ok)
        return data.tobytes()

    def test_jpeg_and_png_uploads_are_read_by_ocr(self):
        for ext in (".jpg", ".png"):
            with self.subTest(ext=ext):
                got = upload(self.encoded(ext, 0), f"notice-photo{ext}").json()
                self.assertEqual(wait_done(got["doc_id"])["status"], "done")
                d = client().get(f"/api/document/{got['doc_id']}").json()
                self.assertEqual((d["text_source"], d["page_count"]), ("ocr", 1))
                self.assertTrue(any(o["due_date"] == "2026-08-21" for o in d["obligations"]))
                self.assertTrue(all(f["rects"] for f in d["bullets"] + d["obligations"]
                                    if f["confidence"] != "none"))
                self.assertEqual(client().get(f"/api/page/{got['doc_id']}/1.jpg").status_code, 200)
                stored = list(config.UPLOADS.glob(f"{got['doc_id']}.*"))
                self.assertEqual([p.suffix for p in stored], [ext])

    def test_a_multi_page_tiff_is_one_document(self):
        path = Path(tempfile.mkdtemp()) / "bundle.tif"
        cv2.imwritemulti(str(path), self.pages)
        result = read_image("tiff-test", path)
        self.assertEqual(result["page_count"], len(self.pages))
        self.assertEqual(result["text_source"], "ocr")
        self.assertIn("2026", result["full_text"])

    def test_a_huge_photo_is_scaled_not_refused(self):
        big = cv2.resize(self.pages[0], None, fx=4, fy=4)            # ~45 megapixels
        path = Path(tempfile.mkdtemp()) / "big.png"
        cv2.imwrite(str(path), big)
        result = read_image("huge-test", path)
        self.assertEqual(result["page_count"], 1)
        shown = cv2.imread(str(config.PAGES / "huge-test" / "1.jpg"))
        self.assertLessEqual(max(shown.shape[:2]), 1700)

    def test_a_broken_image_fails_cleanly(self):
        got = upload(b"\xff\xd8\xff\xe0 not really a jpeg" + bytes(64), "broken.jpg").json()
        row = wait_done(got["doc_id"])
        self.assertEqual(row["status"], "error")
        self.assertIn("could not be read as an image", row["error"])

    def test_other_files_are_refused(self):
        for body, name in ((b"GIF89a....", "x.gif"), (b"PK\x03\x04", "x.docx"), (b"hello", "x.jpg")):
            with self.subTest(name=name):
                self.assertEqual(upload(body, name).status_code, 415)

    def test_inbox_takes_photos_and_skips_the_rest(self):
        for p in config.INBOX.iterdir():
            p.unlink()
        (config.INBOX / "Scan-notice.jpg").write_bytes(self.encoded(".jpg", 1))
        (config.INBOX / "notes.txt").write_text("not a document")
        (config.INBOX / "fake.pdf").write_bytes(b"not a pdf at all")
        started = client().post("/api/inbox/scan").json()["started"]
        self.assertEqual([(s["filename"], s["channel"]) for s in started], [("Scan-notice.jpg", "Scan")])
        self.assertEqual(wait_done(started[0]["doc_id"])["status"], "done")


if __name__ == "__main__":
    unittest.main()
