"""Malayalam repair: fixed inputs with known doubling and orphaning."""
import unicodedata
import unittest

from dueproof.pipeline.read import _join, page_text
from dueproof.pipeline.scripts.malayalam import clean, is_split_word, merge_orphans


def word(text, x0=0.1, y0=0.1, x1=0.2, y1=0.12, block=0, line=0):
    return {"text": text, "x0": x0, "y0": y0, "x1": x1, "y1": y1,
            "block_id": block, "line_id": line, "conf": 1.0}


class Clean(unittest.TestCase):
    def test_collapses_doubled_marks(self):
        for bad, good in [("സുുരക്ഷ", "സുരക്ഷ"), ("കാാലം", "കാലം"), ("ഓഗസ്റ്റ്്", "ഓഗസ്റ്റ്"),
                          ("റിപ്പോോോർട്ട്", "റിപ്പോർട്ട്"), ("അംം", "അം")]:
            with self.subTest(bad=bad):
                self.assertEqual(clean(bad), good)

    def test_leaves_legitimate_text_alone(self):
        # Doubled consonants are real conjuncts and a virama between them is not
        # a doubled mark; Latin doubles are untouched.
        for s in ["റിപ്പോർട്ട്", "സമർപ്പിക്കണം", "അഗ്നിസുരക്ഷ", "coffee", "Maximo 4471", ""]:
            with self.subTest(s=s):
                self.assertEqual(clean(s), s)

    def test_normalises_to_nfc(self):
        decomposed = "കൊ".replace("ൊ", "ൊ")           # e + aa -> o
        self.assertEqual(clean(decomposed), "കൊ")
        self.assertTrue(unicodedata.is_normalized("NFC", clean(decomposed)))

    def test_idempotent(self):
        for s in ["സുുരക്ഷ", "കാാലം", "plain", "ഓഗസ്റ്റ്്"]:
            self.assertEqual(clean(clean(s)), clean(s))


class OrphanMarks(unittest.TestCase):
    def test_reattaches_and_grows_the_box(self):
        out = merge_orphans([word("സുരക്ഷ", x1=0.20), word("ാ", x0=0.20, x1=0.22, y1=0.13)])
        self.assertEqual([w["text"] for w in out], ["സുരക്ഷാ"])
        self.assertEqual((out[0]["x1"], out[0]["y1"]), (0.22, 0.13))

    def test_does_not_double_a_mark_already_present(self):
        out = merge_orphans([word("സുരക്ഷാ"), word("ാ")])
        self.assertEqual([w["text"] for w in out], ["സുരക്ഷാ"])

    def test_leading_orphan_and_ordinary_words_survive(self):
        out = merge_orphans([word("ാ"), word("fire"), word("സുരക്ഷ")])
        self.assertEqual([w["text"] for w in out], ["ാ", "fire", "സുരക്ഷ"])


class SplitWords(unittest.TestCase):
    def test_structural_signals(self):
        for prev, nxt, want in [
            ("സ്റ്റേഷ", "ൻ കൺട്രോളർ", True),         # continuation opens with a chillu
            ("സുരക്ഷ", "ാ പരിശോധന", True),            # ...or a bare vowel sign
            ("പരിശോധന നടത്തി", "റിപ്പോർട്ട്", True),   # short stub ending in a vowel sign
            ("സമർപ്പിക്കണം", "റിപ്പോർട്ട്", False),   # ends in anusvara: a whole word
            ("the fire", "audit report", False),      # Latin never joins
            ("fire", "സുരക്ഷ", False),                # mixed scripts never join
            ("", "സുരക്ഷ", False),
        ]:
            with self.subTest(prev=prev, nxt=nxt):
                self.assertEqual(is_split_word(prev, nxt), want)

    def test_join(self):
        self.assertEqual(_join("സ്റ്റേഷ", "ൻ"), "സ്റ്റേഷൻ")
        self.assertEqual(_join("fire", "audit"), "fire audit")
        self.assertEqual(_join("", "audit"), "audit")


class Reflow(unittest.TestCase):
    def test_wrapped_line_continues_and_heading_does_not(self):
        words = [
            word("HEADING", 0.1, 0.05, 0.3, 0.07, block=0, line=0),
            word("first", 0.1, 0.10, 0.5, 0.12, block=1, line=1),
            word("wrapped", 0.5, 0.10, 0.9, 0.12, block=1, line=1),   # reaches the right edge
            word("continues.", 0.1, 0.125, 0.4, 0.145, block=2, line=2),
        ]
        self.assertEqual(page_text(words), "HEADING\nfirst wrapped continues.")

    def test_empty_page(self):
        self.assertEqual(page_text([]), "")


if __name__ == "__main__":
    unittest.main()
