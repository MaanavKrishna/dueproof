"""Resource caps on what the reader will open: pages, passwords, junk, pixels.
(Moved from the demo's test_server.py; the rest of that file tested the
demo's server, which the TypeScript app replaces.)"""
import unittest
from unittest import mock

from dueproof_engine import config
from dueproof_engine.pipeline import pdf, read
from tests.fixtures import FOLDER, LOCKED, POSTER
from tests.support import make_pdf


class ResourceCaps(unittest.TestCase):
    def test_page_limit(self):
        with mock.patch.object(read, "MAX_PAGES", 2), self.assertRaisesRegex(ValueError, "limit is 2") as c:
            read.read_pdf(make_pdf("long", pages=3))
        self.assertEqual(c.exception.reason, "too_many_pages")

    def test_password_protected_pdf(self):
        with self.assertRaisesRegex(ValueError, "password") as c:
            read.read_pdf(FOLDER / LOCKED)
        self.assertEqual(c.exception.reason, "encrypted")

    def test_a_wrong_password_is_still_encrypted(self):
        with self.assertRaises(read.ReadError) as c:
            read.read_pdf(FOLDER / LOCKED, password="not-the-password")
        self.assertEqual(c.exception.reason, "encrypted")

    def test_not_a_pdf_at_all(self):
        with self.assertRaisesRegex(ValueError, "could not be read as a PDF") as c:
            read.read_pdf(b"%PDF-1.7 and then nothing useful")
        self.assertEqual(c.exception.reason, "malformed")

    def test_a_poster_sized_page_is_rendered_within_the_pixel_cap(self):
        doc = pdf.open_pdf(FOLDER / POSTER)                  # 200 inches square
        img = pdf.render(doc[0], 300)                         # uncapped: 3.6 gigapixels
        self.assertLessEqual(img.shape[0] * img.shape[1], config.MAX_PAGE_PIXELS * 1.01)
        self.assertGreater(img.shape[0], 1000)

    def test_an_ordinary_page_keeps_its_dpi(self):
        doc = pdf.open_pdf(make_pdf("a4"))
        self.assertAlmostEqual(pdf.render(doc[0], 300).shape[1], 595 / 72 * 300, delta=1)

    def test_no_print_statements_left(self):
        from tests.support import PKG
        for path in PKG.rglob("*.py"):
            if "indictrans2" in path.parts or "tools" in path.parts:   # the CLIs print
                continue
            with self.subTest(file=path.name):
                self.assertNotRegex(path.read_text(), r"(?m)^\s*print\(")


if __name__ == "__main__":
    unittest.main()
