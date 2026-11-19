"""Rung 3 has a time limit: a page Tesseract cannot finish is escalated, and
does not hold a worker."""
import importlib.util
import unittest
from unittest import mock

import numpy as np


@unittest.skipIf(any(importlib.util.find_spec(m) is None for m in ("cv2", "pytesseract")),
                 "the tesseract group is not installed")
class TesseractTimeout(unittest.TestCase):
    def test_a_page_tesseract_cannot_finish_is_escalated_not_held(self):
        import pytesseract
        from dueproof_engine import config
        from dueproof_engine.ocr import tesseract
        page = np.full((400, 400, 3), 255, np.uint8)
        with mock.patch.object(pytesseract, "image_to_data",
                               side_effect=RuntimeError("Tesseract process timeout")) as run:
            self.assertEqual(tesseract.read(page, "eng"), ([], 0.0))
        self.assertEqual(run.call_args.kwargs["timeout"], config.TESSERACT_TIMEOUT)

    def test_other_tesseract_failures_still_raise(self):
        import pytesseract
        from dueproof_engine.ocr import tesseract
        page = np.full((400, 400, 3), 255, np.uint8)
        with mock.patch.object(pytesseract, "image_to_data", side_effect=RuntimeError("no such pack")):
            with self.assertRaises(RuntimeError):
                tesseract.read(page, "eng")


if __name__ == "__main__":
    unittest.main()
