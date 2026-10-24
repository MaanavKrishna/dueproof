"""The operator's tools: evaluation, label export, reminders, doctor."""
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import date
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from dueproof import auth, cli, db, digest, doctor, evaluate
from tests.fixtures import FOLDER
from tests.support import client, make_pdf, upload, wait_done


class Evaluation(unittest.TestCase):
    """The fixture corpus, scored against hand labels. These floors are the
    release bar: a change that lowers any of them must say why."""
    @classmethod
    def setUpClass(cls):
        cls.result = evaluate.run(FOLDER / "labels.jsonl", FOLDER)

    def test_nothing_is_outlined_confidently_in_the_wrong_place(self):
        self.assertEqual(self.result["false_confident"], 0.0)

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


class LabelExport(unittest.TestCase):
    def test_reviews_become_labels(self):
        got = upload(make_pdf("labels")).json()
        wait_done(got["doc_id"])
        card = client().get(f"/api/document/{got['doc_id']}").json()
        ob = card["obligations"][0]
        client().patch(f"/api/findings/{ob['id']}", json={"due_date": "2026-12-01", "roles": ["Finance"]})
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "labels.jsonl"
            n = evaluate.export_labels(out)
            rows = [json.loads(line) for line in out.read_text().splitlines()]
        mine = next(r for r in rows if r["file"] == "test.pdf" and any(
            o["due_date"] == "2026-12-01" for o in r["obligations"]))
        self.assertGreaterEqual(n, 1)
        self.assertEqual(mine["obligations"][0]["desks"], ["Finance"])
        self.assertEqual(mine["not_obligations"], [])
        client().patch(f"/api/findings/{ob['id']}", json={"status": "dismissed"})
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "labels.jsonl"
            evaluate.export_labels(out)
            rows = [json.loads(line) for line in out.read_text().splitlines()]
        self.assertTrue(any(ob["evidence_quote"] in r["not_obligations"] for r in rows))


class Digest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        got = upload(make_pdf("digest")).json()
        wait_done(got["doc_id"])
        cls.ob = client().get(f"/api/document/{got['doc_id']}").json()["obligations"][0]

    def test_assignee_desk_and_window(self):
        client().patch(f"/api/findings/{self.ob['id']}",
                       json={"assignee": "dig@example.org", "due_date": "2026-11-02"})
        user = {"email": "dig@example.org", "desk": "Finance", "name": "Dig"}
        ids = lambda days, now: [i["id"] for i in digest.items_for(user, days, now)]
        self.assertIn(self.ob["id"], ids(7, date(2026, 10, 30)))         # due in 3 days
        self.assertNotIn(self.ob["id"], ids(1, date(2026, 10, 30)))      # outside the window
        self.assertIn(self.ob["id"], ids(1, date(2026, 11, 20)))         # overdue: always in
        other = {"email": "other@example.org", "desk": "Station Controller", "name": "O"}
        self.assertNotIn(self.ob["id"], [i["id"] for i in digest.items_for(other, 400, date(2026, 10, 30))])
        client().patch(f"/api/findings/{self.ob['id']}", json={"status": "done"})
        self.assertNotIn(self.ob["id"], ids(400, date(2026, 10, 30)))    # done items drop out
        client().patch(f"/api/findings/{self.ob['id']}", json={"status": "open", "assignee": ""})
        desk = {"email": "desk@example.org", "desk": self.ob["roles"][0], "name": "Desk"}
        self.assertIn(self.ob["id"], [i["id"] for i in digest.items_for(desk, 400, date(2026, 10, 30))])

    def test_render(self):
        items = [{"id": "a", "doc_id": "d", "due": "2026-10-01", "days_left": -3, "text_en": "Pay the fee.",
                  "text_local": None, "page_num": 2, "title": "GST notice", "reference": "ZD1"},
                 {"id": "b", "doc_id": "d", "due": "2026-10-06", "days_left": 2, "text_en": None,
                  "text_local": "സമർപ്പിക്കണം", "page_num": 1, "title": "Circular", "reference": None}]
        text = digest.render(items, "Asha", 7, "https://dueproof.example.org/")
        for want in ("Hello Asha", "1 overdue and 1 due in the next 7 days", "3 days overdue",
                     "in 2 days", "GST notice · ZD1 · page 2", "സമർപ്പിക്കണം",
                     "https://dueproof.example.org/#doc=d"):
            self.assertIn(want, text)

    def test_send_needs_smtp_and_uses_it(self):
        with self.assertRaisesRegex(SystemExit, "DUEPROOF_SMTP_HOST"), mock.patch.dict("os.environ", {}, clear=True):
            digest.send("a@b.c", "s", "b")
        with mock.patch.dict("os.environ", {"DUEPROOF_SMTP_HOST": "smtp.example.org", "DUEPROOF_SMTP_USER": "u",
                                            "DUEPROOF_SMTP_PASSWORD": "p"}), \
                mock.patch("smtplib.SMTP") as smtp:
            digest.send("a@b.c", "Subject here", "Body")
        session = smtp.return_value.__enter__.return_value
        session.starttls.assert_called_once()
        session.login.assert_called_once_with("u", "p")
        sent = session.send_message.call_args[0][0]
        self.assertEqual((sent["To"], sent["Subject"]), ("a@b.c", "Subject here"))

    def test_command(self):
        auth.add_user("cmd-digest@example.org", "Cmd", self.ob["roles"][0], None)
        out = io.StringIO()
        with redirect_stdout(out):
            self.assertEqual(cli.main(["digest", "--days", "400", "--to", "cmd-digest@example.org"]), 0)
        self.assertIn("=== cmd-digest@example.org", out.getvalue())


class Doctor(unittest.TestCase):
    def test_reports_each_check(self):
        out = io.StringIO()
        with redirect_stdout(out):
            code = doctor.main()
        text = out.getvalue()
        for what in ("Python", "Tesseract", "OCR for Malayalam", "Data folder", "Database", "Sign-in"):
            self.assertIn(what, text)
        self.assertIn("DUEPROOF_AUTH=none", text)                       # the suite runs without sign-in
        self.assertEqual(code, 0)

    def test_a_missing_tesseract_fails(self):
        with mock.patch.object(doctor, "TESSERACT_CMD", "/nonexistent/tesseract"), \
                redirect_stdout(io.StringIO()) as out:
            self.assertEqual(doctor.main(), 1)
        self.assertIn("[FAIL] Tesseract", out.getvalue())

    def test_local_sign_in_without_accounts_fails(self):
        with mock.patch.object(doctor, "AUTH", "local"), \
                mock.patch.object(db, "one", side_effect=lambda sql, *a: {"n": 0}), \
                redirect_stdout(io.StringIO()) as out:
            self.assertEqual(doctor.main(), 1)
        self.assertIn("dueproof users add", out.getvalue())


if __name__ == "__main__":
    unittest.main()
