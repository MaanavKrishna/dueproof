"""Citation linking: confidence bands and the refusal to guess."""
import unittest

from dueproof.pipeline.link import STRONG, WEAK, build_index, confidence_of, link_quote


def words(text, page=1):
    return [{"text": t, "x0": 0.1 + 0.05 * i, "y0": 0.1, "x1": 0.14 + 0.05 * i, "y1": 0.12,
             "line_id": 0, "page_num": page} for i, t in enumerate(text.split())]

PAGE1 = "The Station Controller shall submit the fire audit report on or before 21 August 2026."
PAGE2 = "റിപ്പോർട്ട് 2026 ഓഗസ്റ്റ് 21-ന് മുമ്പ് സമർപ്പിക്കണം."
INDEX = build_index({1: words(PAGE1), 2: words(PAGE2, 2)})


class Link(unittest.TestCase):
    def test_verbatim_is_exact(self):
        hit = link_quote("shall submit the fire audit report", INDEX)
        self.assertEqual((hit["page_num"], hit["score"], hit["confidence"]), (1, 100.0, "exact"))
        self.assertTrue(hit["rects"])

    def test_space_and_case_insensitive(self):
        hit = link_quote("SHALL SUB MIT THEFIRE audit   report", INDEX)
        self.assertEqual(hit["confidence"], "exact")

    def test_malayalam_on_the_right_page(self):
        hit = link_quote("മുമ്പ് സമർപ്പിക്കണം", INDEX, hint_page=1)   # wrong hint
        self.assertEqual((hit["page_num"], hit["confidence"]), (2, "exact"))

    def test_ocr_noise_is_strong_not_exact(self):
        hit = link_quote("shal1 submlt the fire audlt rep0rt on or before", INDEX)
        self.assertIn(hit["confidence"], ("strong", "approximate"))
        self.assertLess(hit["score"], 99)

    def test_absent_quote_gets_no_rectangles(self):
        """Visibly wrong on purpose: below the floor there is no box at all."""
        for q in ["quarterly effluent discharge figures for Muttom depot", "xyz", "", None]:
            with self.subTest(q=q):
                hit = link_quote(q, INDEX, hint_page=1)
                self.assertEqual((hit["confidence"], hit["rects"]), ("none", []))

    def test_bands(self):
        self.assertEqual([confidence_of(s) for s in (100, 99, 98.9, STRONG, STRONG - 0.1,
                                                     WEAK, WEAK - 0.1, 0, None)],
                         ["exact", "exact", "strong", "strong", "approximate",
                          "approximate", "none", "none", "none"])


if __name__ == "__main__":
    unittest.main()
