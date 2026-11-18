"""Citation linking: confidence bands and the refusal to guess."""
import unittest

from dueproof_engine.pipeline.link import STRONG, WEAK, build_index, confidence_of, link_quote


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


NOTICE = ("You are directed to appear before the undersigned on 20.10.2026 at 11 AM and to furnish "
          "reply within 15 days of receipt of this notice failing which penalty of Rs. 4,52,300 will "
          "be levied")
NOTICE_INDEX = build_index({1: words(NOTICE)})


class Figures(unittest.TestCase):
    """Fuzzy matching forgives a letter, never a digit (C3)."""
    def test_a_quote_with_other_numbers_is_not_located(self):
        for q in ["appear before the undersigned on 30.10.2026 at 11 AM",
                  "appear before the undersigned on 20.11.2027",
                  "furnish reply within 45 days of receipt",
                  "furnish reply within 30 days of receipt of this notice",
                  "penalty of Rs. 9,52,300 will be levied",
                  "you must reply within 30 days"]:
            with self.subTest(q=q):
                hit = link_quote(q, NOTICE_INDEX, hint_page=1)
                self.assertEqual((hit["confidence"], hit["rects"]), ("none", []))

    def test_the_same_numbers_in_other_words_still_match(self):
        hit = link_quote("you must appear before the undersigned on 20.10.2026 at 11AM", NOTICE_INDEX, 1)
        self.assertIn(hit["confidence"], ("strong", "approximate"))
        hit = link_quote("penalty of Rs.4,52,300/- will be levied", NOTICE_INDEX, 1)
        self.assertIn(hit["confidence"], ("exact", "strong"))
        self.assertTrue(hit["rects"])


if __name__ == "__main__":
    unittest.main()
