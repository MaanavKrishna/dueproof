"""Golden-file tests: the findings for the generated fixture corpus are pinned.
A change to the pipeline that alters them has to be deliberate — regenerate
with `python -m tests.make_golden` and read the diff."""
import unittest

from tests.support import CIRCULAR, SCAN, golden, snapshot


class GoldenCorpus(unittest.TestCase):
    maxDiff = None

    def test_same_documents(self):
        self.assertEqual(sorted(snapshot()), sorted(golden()))

    def test_document_fields(self):
        for name, want in golden().items():
            got = snapshot()[name]
            for key in ("title", "doc_type", "doc_date", "languages", "page_count", "text_source"):
                with self.subTest(doc=name, field=key):
                    self.assertEqual(got[key], want[key])

    def test_findings(self):
        for name, want in golden().items():
            got = snapshot()[name]["findings"]
            with self.subTest(doc=name):
                self.assertEqual([(f["kind"], f["quote"]) for f in got],
                                 [(f["kind"], f["quote"]) for f in want["findings"]])
            for g, w in zip(got, want["findings"]):
                with self.subTest(doc=name, quote=w["quote"][:50]):
                    for key in ("lang", "due_date", "severity", "roles", "page",
                                "confidence", "lines"):
                        self.assertEqual(g[key], w[key], key)
                    self.assertAlmostEqual(g["score"], w["score"], delta=0.5)

    def test_corpus_totals(self):
        findings = [f for d in snapshot().values() for f in d["findings"]]
        self.assertEqual(len(snapshot()), 4)
        self.assertEqual(sum(1 for f in findings if f["due_date"]), 12)
        self.assertEqual({f["lang"] for f in findings}, {"en", "ml"})

    def test_no_false_confidence_without_rectangles(self):
        """A finding may only claim a confidence band if it carries boxes."""
        for name, doc in snapshot().items():
            for f in doc["findings"]:
                with self.subTest(doc=name, quote=f["quote"][:50]):
                    self.assertEqual(f["lines"] == 0, f["confidence"] == "none")

    def test_the_buried_deadline(self):
        """A regulator's deadline in a Malayalam paragraph on the last page:
        found, dated, and located verbatim with one rectangle per line."""
        hit, = [f for f in snapshot()[CIRCULAR]["findings"]
                if f["kind"] == "obligation" and f["page"] == 3]
        self.assertEqual((hit["due_date"], hit["lang"], hit["confidence"], hit["lines"]),
                         ("2026-09-05", "ml", "exact", 3))

    def test_the_scan_takes_the_ocr_path_and_finds_the_same_deadlines(self):
        native, scan = snapshot()[CIRCULAR], snapshot()[SCAN]
        self.assertEqual((native["text_source"], scan["text_source"]), ("native", "ocr"))
        dates = lambda d: {f["due_date"] for f in d["findings"] if f["due_date"]}
        self.assertLessEqual({"2026-08-21", "2026-08-31"}, dates(scan) & dates(native))

    def test_duplicate_pair_separates_from_the_rest(self):
        from dueproof.pipeline.link import near_duplicate_score
        snap = snapshot()
        names = sorted(snap)
        scores = {(a, b): near_duplicate_score(snap[a]["full_text"], snap[b]["full_text"])
                  for i, a in enumerate(names) for b in names[i + 1:]}
        pair = tuple(sorted((CIRCULAR, SCAN)))
        self.assertGreaterEqual(scores[pair], 80)
        self.assertLess(max(s for k, s in scores.items() if k != pair), 80)


if __name__ == "__main__":
    unittest.main()
