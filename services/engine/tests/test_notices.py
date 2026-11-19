"""Notices: reference, issuing office, sections, amount demanded, deadlines that
run from receipt, hearings — and the default notices profile end to end."""
import unittest
from datetime import date

from dueproof_engine.pipeline.analyze import (analyze, deadline_in, due_basis, notice_details, parse_date,
                                       section_of)
from tests.fixtures import FOLDER, NOTICE

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


    def test_scales_and_spaced_digit_groups(self):
        for line, want in (("You are to pay the demand of Rs. 1.5 Cr. within 30 days", 15000000),
                           ("Tax payable Rs 2 crs", 20000000), ("Tax payable Rs. 3 lac", 300000),
                           ("Demand payable Rs. 12 Lakhs", 1200000), ("demand payable Rs.4 52 300", 452300),
                           ("Tax payable Rupees 4,52,300 only", 452300), ("Tax payable: 4,52,300/-", 452300)):
            with self.subTest(line=line):
                self.assertAlmostEqual(self.amount(line), want)

    def test_turnover_and_refund_are_not_the_demand(self):
        self.assertEqual(self.amount("The total turnover declared was Rs. 5,00,00,000 and the tax short "
                                     "paid is Rs. 45,000 which is payable with interest."), 45000)
        self.assertEqual(self.amount("Tax due Rs. 1,00,000", "Refund due to you of Rs. 9,00,000 was adjusted."),
                         100000)
        self.assertEqual(self.amount("Tax of Rs. 45,000 on a taxable value of Rs. 2,50,000 is payable."), 45000)
        self.assertIsNone(self.amount("Your turnover of Rs. 5,00,00,000 was verified."))

    def test_a_total_wins_over_its_parts(self):
        from dueproof_engine.pipeline.analyze import demand
        d = demand(["Tax Rs. 1,00,000; Interest Rs. 18,000; Penalty Rs. 10,000; Total demand Rs. 1,28,000."])
        self.assertEqual((d["value"], d["doubtful"]), (128000, False))

    def test_several_amounts_and_no_total_are_doubtful(self):
        from dueproof_engine.pipeline.analyze import demand
        d = demand(["Tax Rs. 1,00,000, interest Rs. 18,000 and penalty Rs. 10,000 are payable."])
        self.assertTrue(d["doubtful"])
        d = demand(["You are directed to pay the tax of Rs. 4,52,300 with interest.",
                    "Failure to reply will attract a penalty of Rs. 2.5 lakh."])   # a threat, not a demand
        self.assertEqual((d["value"], d["doubtful"]), (452300, False))

    def test_a_figure_cut_short_is_dropped(self):
        self.assertIsNone(self.amount("Tax payable Rs. 4,52 300 7"))


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


class NoticesProfile(unittest.TestCase):
    """The default profile, on a fictional GST notice — read as the engine
    reads it, analysed by the notices_in analyzer whatever the process default."""
    @classmethod
    def setUpClass(cls):
        from dueproof_engine.pipeline.analyzers import analyzer
        from dueproof_engine.pipeline.link import build_index, link_quote
        from dueproof_engine.pipeline.read import read_pdf
        cls.rules = analyzer("notices_in")
        doc = read_pdf(FOLDER / NOTICE)
        cls.before = cls.rules.analyze(doc["page_texts"], "notice.pdf", received=date(2026, 10, 24))
        cls.after = cls.rules.analyze(doc["page_texts"], "notice.pdf", received=date(2026, 10, 22))
        index = build_index({1: doc["words"]})
        cls.links = [link_quote(o["evidence_quote"], index, o["page"])
                     for o in cls.before["obligations"]]

    def test_settings(self):
        from dueproof_engine import profiles
        p = profiles.load("notices_in")
        self.assertEqual(p.TIMEZONE, "Asia/Kolkata")
        self.assertIn("GST & Indirect Tax", p.ROLES)
        self.assertIn("GST portal", p.CHANNELS)
        self.assertEqual([lang["code"] for lang in self.rules.LOCALS], ["hi"])

    def test_what_the_notice_is_filed_under(self):
        d = self.before
        self.assertEqual(d["doc_type"], "GST notice")
        n = d["notice"]
        self.assertEqual((n["reference"], n["authority"]),
                         ("ZD2910260012345", "Assistant Commissioner of State Tax"))
        self.assertEqual((n["amount"], n["amount_text"]), (452300, "Rs. 4,52,300"))
        self.assertEqual(n["sections"], ["Section 61", "Section 73(1)"])
        self.assertEqual(d["doc_date"], "2026-10-20")

    def test_reply_runs_from_receipt_and_the_hearing_is_on_the_line(self):
        obs = {o["tag"] or "reply": o for o in self.before["obligations"] if o["due_date"]}
        self.assertEqual(obs["reply"]["due_date"], "2026-11-23")          # 24 Oct + 30 days
        self.assertEqual(obs["reply"]["due_basis"], "receipt:30")
        self.assertEqual(obs["reply"]["due_rule"],
                         {"type": "relative", "anchor": "receipt", "amount": 30, "unit": "days"})
        self.assertEqual(obs["hearing"]["due_date"], "2026-11-18")
        self.assertEqual(obs["hearing"]["due_rule"], {"type": "fixed", "date": "2026-11-18"})
        for o in obs.values():
            self.assertEqual(o["roles"][0], "GST & Indirect Tax")
        self.assertTrue(all(hit["confidence"] == "exact" for hit in self.links))

    def test_correcting_the_received_date_moves_only_receipt_deadlines(self):
        after = {o["tag"] or "reply": o for o in self.after["obligations"] if o["due_date"]}
        self.assertEqual(after["reply"]["due_date"], "2026-11-21")
        self.assertEqual(after["hearing"]["due_date"], "2026-11-18")


class Rules(unittest.TestCase):
    """What a deadline sentence says, as a DateRule (contracts/date-rule.ts)."""
    def test_shapes(self):
        from dueproof_engine.pipeline.analyze import date_rule
        cases = {
            "Reply within 30 days of receipt of this notice.":
                {"type": "relative", "anchor": "receipt", "amount": 30, "unit": "days"},
            "Reply within 30 days of this notice.":
                {"type": "relative", "anchor": "issue", "amount": 30, "unit": "days"},
            "Reply within 2 weeks from the date of service of this notice.":
                {"type": "relative", "anchor": "service", "amount": 14, "unit": "days"},
            "An appeal may be filed within 3 months from the date of communication of this order, "
            "and the authority may allow a further period of one month.":
                {"type": "relative", "anchor": "service", "amount": 3, "unit": "months"},
            "An appeal lies within 3 months from the date of the order, or within a further "
            "period of 1 month if sufficient cause is shown.":
                {"type": "relative", "anchor": "order", "amount": 3, "unit": "months",
                 "condonable": {"amount": 1, "unit": "months"}},
            "Submit the documents within 7 working days of receipt.":
                {"type": "relative", "anchor": "receipt", "amount": 7, "unit": "working_days"},
            "Reply on or before 30 November 2026.": {"type": "fixed", "date": "2026-11-30"},
            "A personal hearing is fixed on 18 November 2026.": {"type": "fixed", "date": "2026-11-18"},
        }
        for sentence, want in cases.items():
            with self.subTest(sentence=sentence[:50]):
                self.assertEqual(date_rule(sentence), want)
        self.assertIsNone(date_rule("The meeting was held on 3 March 2026."))   # no deadline marker

    def test_the_engine_date_is_calendar_correct(self):
        from dueproof_engine.pipeline.analyze import resolve_rule
        rel = lambda n, unit, anchor="receipt": {"type": "relative", "anchor": anchor, "amount": n, "unit": unit}
        self.assertEqual(resolve_rule(rel(30, "days"), None, date(2026, 10, 24)), "2026-11-23")
        self.assertEqual(resolve_rule(rel(3, "months", "issue"), date(2026, 11, 30), None), "2027-02-28")
        self.assertIsNone(resolve_rule(rel(30, "days"), date(2026, 10, 1), None))    # receipt unknown
        self.assertIsNone(resolve_rule(rel(7, "working_days"), None, date(2026, 10, 24)))
        self.assertIsNone(resolve_rule(rel(3, "months", "order"), date(2026, 10, 1), date(2026, 10, 2)))


HEAD = ("OFFICE OF THE ASSISTANT COMMISSIONER OF STATE TAX\n"
        "FORM GST DRC-01 Show cause notice under section 73 of the Goods and Services Tax Act\n"
        "Reference No: ZD271026001234X Date: 24.10.2026\n"
        "GSTIN: 27AAAPA1234A1Z5 Subject: Show cause notice under section 73 for tax short paid\n")


def served(text: str, received: str = "2026-11-02"):
    """`text` through the engine's /v1/analyze and /v1/link, as one page."""
    from dueproof_engine.api import models as m, service
    words = [m.Word(text=w, rect=(10 + i * 12, 10 + n * 12, 20 + i * 12, 20 + n * 12), line=n)
             for n, line in enumerate(text.split("\n")) for i, w in enumerate(line.split())]
    page = m.PageText(page=1, width=595, height=842, rotation=0, text=text, words=words,
                      engine="text_layer", confidence=0.99, languages=["en"])
    got = service.analyze(m.AnalyzeRequest(pages=[page], receivedOn=received, profile="notices_in"))
    links = service.link(m.LinkRequest(pages=[page], quotes=[
        m.LinkQuote(id=str(i), text=f.quote, pageHint=f.pageHint) for i, f in enumerate(got.findings)]))
    return got, links.matches


class EndToEnd(unittest.TestCase):
    """The reviewer's notices (C1, C2), through the service as the app calls it."""
    def duty(self, sentence):
        got, matches = served(HEAD + sentence)
        f, = [f for f in got.findings if f.kind in ("deadline", "hearing", "obligation")
              and f.quote == sentence]
        return got, f

    def test_a_relative_period_beats_the_notice_date(self):
        got, f = self.duty("You are hereby directed to furnish your reply within 30 days from the date "
                           "of this notice dated 24.10.2026 failing which the case will be decided ex parte.")
        self.assertEqual(f.dueRule.model_dump(exclude_none=True),
                         {"type": "relative", "anchor": "issue", "amount": 30, "unit": "days"})
        self.assertEqual(f.engineDueOn, "2026-11-23")

    def test_the_new_hearing_date_not_the_old_one(self):
        got, f = self.duty("The personal hearing earlier fixed on 25.11.2026 is preponed and you are "
                           "directed to appear in person for hearing on 10.11.2026 at 11 AM.")
        self.assertEqual(f.dueRule.model_dump(), {"type": "fixed", "date": "2026-11-10"})

    def test_a_doubtful_sentence_goes_to_a_person(self):
        got, f = self.duty("You are requested to furnish the reply within 45 days or by 20.12.2026, "
                           "whichever is earlier, failing which penalty will be levied.")
        self.assertEqual((f.kind, f.dueRule), ("obligation", None))
        self.assertLess(f.confidence, 0.6)                 # under the app's review bar
        self.assertFalse(got.confident)

    def test_the_demand_not_the_turnover(self):
        got, _ = served(HEAD + "The total turnover declared was Rs. 5,00,00,000 and the tax short paid "
                               "is Rs. 45,000 which is payable with interest within 30 days of receipt.")
        amount, = [f for f in got.findings if f.kind == "amount"]
        self.assertEqual(amount.amountMinor, 45000 * 100)
        got, _ = served(HEAD + "You are required to pay the demand of Rs. 1.5 Cr. within 30 (thirty) days "
                               "of service of this notice failing which recovery proceedings will follow.")
        amount, = [f for f in got.findings if f.kind == "amount"]
        self.assertEqual(amount.amountMinor, 15000000 * 100)

    def test_a_doubtful_amount_is_below_the_review_bar(self):
        got, _ = served(HEAD + "Tax Rs. 1,00,000, interest Rs. 18,000 and penalty Rs. 10,000 are payable "
                               "within 30 days of receipt of this notice.")
        amount, = [f for f in got.findings if f.kind == "amount"]
        self.assertLess(amount.confidence, 0.6)
        self.assertFalse(got.confident)


if __name__ == "__main__":
    unittest.main()
