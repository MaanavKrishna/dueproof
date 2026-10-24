"""Notices: reference, issuing office, sections, amount demanded, deadlines that
run from receipt, hearings — and the default notices profile end to end."""
import json
import unittest
from datetime import date

from dueproof.pipeline.analyze import (analyze, deadline_in, due_basis, notice_details, parse_date,
                                       section_of)
from tests.fixtures import FOLDER, NOTICE
from tests.test_profiles import run

RECEIVED = date(2026, 10, 24)


class Sections(unittest.TestCase):
    def test_provisions_are_normalised(self):
        for text, want in (("under Section 143(2) of the Act", "Section 143(2)"),
                           ("u/s 148A(b)", "Section 148A(b)"), ("u/s. 156", "Section 156"),
                           ("sec. 7A of the EPF Act", "Section 7A"), ("Rule 86A", "Rule 86A"),
                           ("section 73 (1)", "Section 73(1)"), ("Regulation 30", "Regulation 30"),
                           ("Article 226", "Article 226"), ("no provision here", None),
                           ("the second section of this letter", None)):
            with self.subTest(text=text):
                self.assertEqual(section_of(text), want)


class Amounts(unittest.TestCase):
    def amount(self, *lines):
        return notice_details(["\n".join(lines)])["amount"]

    def test_the_demand_not_the_line_items(self):
        self.assertEqual(self.amount("Brake pads 48 Rs. 18,400 Rs. 8,83,200",
                                     "You are directed to pay the tax of Rs. 4,52,300 with interest."),
                         452300)
        self.assertIsNone(self.amount("Brake pads 48 Rs. 18,400"))       # no demand, no amount

    def test_written_forms(self):
        for line, want in (("Total demand payable ₹ 12,34,567.50", 1234567.5),
                           ("penalty of Rs 2.5 lakh", 250000), ("tax due INR 3 crore", 30000000),
                           ("interest payable Rs.1,000", 1000), ("outstanding ₹7.25 lakhs", 725000)):
            with self.subTest(line=line):
                self.assertAlmostEqual(self.amount(line), want)


class Details(unittest.TestCase):
    def test_reference_authority_and_sections(self):
        d = notice_details(["OFFICE OF THE ASSISTANT COMMISSIONER OF STATE TAX\n"
                            "Reference No: ZD2910260012345   Date: 20 October 2026\n"
                            "Subject: Notice under Section 61\nproceedings under Section 73(1)"])
        self.assertEqual(d["reference"], "ZD2910260012345")
        self.assertEqual(d["authority"], "Assistant Commissioner Of State Tax")
        self.assertEqual(d["sections"], ["Section 61", "Section 73(1)"])

    def test_nothing_to_find(self):
        self.assertEqual(notice_details(["A friendly note with no numbers."]),
                         {"reference": None, "authority": None, "amount": None,
                          "amount_text": None, "sections": []})


class Deadlines(unittest.TestCase):
    def test_receipt_relative_deadlines_count_from_receipt(self):
        s = "Reply within 30 days of receipt of this notice."
        self.assertEqual(due_basis(s), "receipt:30")
        self.assertEqual(deadline_in(s, date(2026, 10, 1), RECEIVED), "2026-11-23")
        self.assertEqual(deadline_in("Reply within 30 days of this notice.", date(2026, 10, 1),
                                     RECEIVED), "2026-10-31")            # from issue, not receipt
        self.assertIsNone(due_basis("Reply by 30 November 2026, within 30 days of receipt."))
        self.assertEqual(due_basis("Reply within 2 weeks from the date of service of this notice."),
                         "receipt:14")

    def test_a_hearing_is_a_deadline_without_a_marker(self):
        s = "A personal hearing is fixed on 18 November 2026 at 11:00 AM."
        self.assertEqual(deadline_in(s, None), "2026-11-18")
        self.assertIsNone(deadline_in("The hearing was useful.", None))

    def test_abbreviations_do_not_end_sentences(self):
        r = analyze(["You are hereby directed to pay the tax of Rs. 4,52,300 with interest "
                     "within 30 days of receipt of this notice. Notice No. 117 refers."],
                    "n.pdf", received=RECEIVED)
        quotes = [o["evidence_quote"] for o in r["obligations"]]
        self.assertTrue(any("Rs. 4,52,300 with interest within 30 days" in q for q in quotes), quotes)
        self.assertEqual(r["obligations"][0]["due_date"], "2026-11-23")

    def test_the_labelled_date_is_the_document_date(self):
        r = analyze(["A personal hearing is fixed on 18 November 2026.\nDate: 20 October 2026"], "n.pdf")
        self.assertEqual(r["doc_date"], "2026-10-20")
        self.assertEqual(parse_date("Dated 16 August 2026"), "2026-08-16")


NOTICES_RUN = """
    import json, time
    from fastapi.testclient import TestClient
    from dueproof import config
    from dueproof.web.app import app
    c = TestClient(app, headers={"X-Dueproof": "1"})
    data = open(%r, "rb").read()
    got = c.post("/api/upload", files={"file": ("notice.pdf", data, "application/pdf")},
                 data={"received_on": "2026-10-24", "channel": "GST portal"}).json()
    while not c.get(f"/api/status/{got['doc_id']}").json()["done"]:
        time.sleep(0.05)
    before = c.get(f"/api/document/{got['doc_id']}").json()
    moved = c.patch(f"/api/documents/{got['doc_id']}", json={"received_on": "2026-10-22"}).json()
    after = c.get(f"/api/document/{got['doc_id']}").json()
    future = c.patch(f"/api/documents/{got['doc_id']}", json={"received_on": "2999-01-01"}).status_code
    bad = c.patch(f"/api/documents/{got['doc_id']}", json={"received_on": "28/10/2026"}).status_code
    print(json.dumps({"profile": config.ORG_NAME, "tz": str(config.TZ), "meta": c.get("/api/meta").json(),
                      "before": before, "after": after, "moved": moved, "future": future, "bad": bad},
                     ensure_ascii=False))
"""


class NoticesProfile(unittest.TestCase):
    """The default profile, on a fictional GST notice."""
    @classmethod
    def setUpClass(cls):
        cls.proc = run(NOTICES_RUN % str(FOLDER / NOTICE), DUEPROOF_PROFILE="notices_in",
                       DUEPROOF_TRANSLATE="0")
        cls.out = json.loads(cls.proc.stdout) if cls.proc.returncode == 0 else {}

    def setUp(self):
        self.assertEqual(self.proc.returncode, 0, self.proc.stderr[-2000:])

    def test_settings(self):
        meta = self.out["meta"]
        self.assertEqual(self.out["tz"], "Asia/Kolkata")
        self.assertIn("GST & Indirect Tax", meta["roles"])
        self.assertIn("GST portal", meta["channels"])
        self.assertEqual([lang["code"] for lang in meta["locals"]], ["hi"])

    def test_what_the_notice_is_filed_under(self):
        d = self.out["before"]
        self.assertEqual(d["doc_type"], "GST notice")
        self.assertEqual(d["source_channel"], "GST portal")
        self.assertEqual((d["reference"], d["authority"]),
                         ("ZD2910260012345", "Assistant Commissioner of State Tax"))
        self.assertEqual((d["amount"], d["amount_text"]), (452300, "Rs. 4,52,300"))
        self.assertEqual(d["sections"], ["Section 61", "Section 73(1)"])
        self.assertEqual((d["doc_date"], d["received_on"]), ("2026-10-20", "2026-10-24"))

    def test_reply_runs_from_receipt_and_the_hearing_is_on_the_line(self):
        obs = {o["tag"] or "reply": o for o in self.out["before"]["obligations"] if o["due_date"]}
        self.assertEqual(obs["reply"]["due_date"], "2026-11-23")          # 24 Oct + 30 days
        self.assertEqual(obs["reply"]["due_basis"], "receipt:30")
        self.assertEqual(obs["hearing"]["due_date"], "2026-11-18")
        for o in obs.values():
            self.assertEqual(o["roles"][0], "GST & Indirect Tax")
            self.assertEqual(o["confidence"], "exact")

    def test_correcting_the_received_date_moves_only_receipt_deadlines(self):
        after = {o["tag"] or "reply": o for o in self.out["after"]["obligations"] if o["due_date"]}
        self.assertEqual(self.out["after"]["received_on"], "2026-10-22")
        self.assertEqual(after["reply"]["due_date"], "2026-11-21")
        self.assertEqual(after["hearing"]["due_date"], "2026-11-18")
        self.assertEqual((self.out["future"], self.out["bad"]), (422, 422))


if __name__ == "__main__":
    unittest.main()
