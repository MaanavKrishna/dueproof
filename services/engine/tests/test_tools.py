"""The operator's tools: evaluation against hand labels."""
import io
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from dueproof_engine.tools import evaluate
from tests.fixtures import FOLDER
from tests.support import tesseract_present


class Evaluation(unittest.TestCase):
    """The fixture corpus, scored against hand labels. These floors are the
    release bar: a change that lowers any of them must say why."""
    @classmethod
    def setUpClass(cls):
        cls.result = evaluate.run(FOLDER / "labels.jsonl", FOLDER)

    def test_nothing_is_outlined_confidently_in_the_wrong_place(self):
        self.assertEqual(self.result["false_confident"], 0.0)

    # The floors are measured on the full ladder. Without Tesseract (engine-fast)
    # the scan's Malayalam paragraphs are escalated, not read, so its labelled
    # Malayalam duties are missing and a weaker English sentence takes a slot:
    # that reading is reported in needsEscalation, not delivered as final.
    @unittest.skipUnless(tesseract_present(), "release floors are measured with every OCR rung")
    def test_release_floors(self):
        r = self.result
        self.assertEqual(r["documents"], 5)
        self.assertGreaterEqual(r["precision"], 0.95)
        self.assertGreaterEqual(r["recall"], 0.75)
        self.assertEqual(r["deadline_exact"], 1.0)
        self.assertGreaterEqual(r["desk_top3"], 0.7)
        self.assertEqual(r["labelled_non_obligations_flagged"], 0)

    def test_scoring_arithmetic(self):
        pred = {"a.pdf": {"findings": [
            {"kind": "obligation", "evidence_quote": "Pay the fee by 1 May 2026.", "due_date": "2026-05-01",
             "roles": ["Finance"], "link": {"confidence": "exact"}, "located": evaluate._key("Pay the fee by 1 May 2026.")},
            {"kind": "obligation", "evidence_quote": "The meeting was held in March.", "due_date": None,
             "roles": ["Admin"], "link": {"confidence": "exact"}, "located": evaluate._key("something else entirely")},
        ]}}
        labels = [{"file": "a.pdf", "obligations": [
            {"quote": "pay the fee", "due_date": "2026-05-02", "desks": ["Finance"]},
            {"quote": "file the return", "due_date": "2026-06-01"}],
            "not_obligations": ["meeting was held"]}]
        r = evaluate.score(labels, pred)
        self.assertEqual((r["precision"], r["recall"]), (0.5, 0.5))
        self.assertEqual(r["deadline_exact"], 0.0)                       # off by one day is wrong
        self.assertEqual((r["desk_top1"], r["desk_top3"]), (1.0, 1.0))
        self.assertEqual(r["false_confident"], 0.5)
        self.assertEqual(r["labelled_non_obligations_flagged"], 1)

    def test_chillu_spellings_match(self):
        self.assertEqual(evaluate._key("ഒഴിപ്പിക്കല്‍"), evaluate._key("ഒഴിപ്പിക്കൽ"))

    def test_cli_floors_set_the_exit_code(self):
        def args(**floors):
            base = dict(labels=FOLDER / "labels.jsonl", docs=FOLDER, json=False, min_precision=None,
                        min_recall=None, min_deadline=None, max_false_confident=None)
            return SimpleNamespace(**{**base, **floors})
        with mock.patch.object(evaluate, "run", return_value=self.result), \
                redirect_stdout(io.StringIO()), mock.patch("sys.stderr", io.StringIO()):
            self.assertEqual(evaluate.main(args()), 0)
            self.assertEqual(evaluate.main(args(min_recall=0.99)), 1)
            self.assertEqual(evaluate.main(args(max_false_confident=0.0, min_precision=0.9)), 0)

    def test_bad_label_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            bad = Path(tmp) / "bad.jsonl"
            bad.write_text('{"file": "x.pdf"\n')
            with self.assertRaisesRegex(SystemExit, "bad.jsonl:1"):
                evaluate.load(bad)
            bad.write_text('{"file": "missing.pdf"}\n')
            with self.assertRaisesRegex(SystemExit, "not in"):
                evaluate.run(bad, Path(tmp))


if __name__ == "__main__":
    unittest.main()
