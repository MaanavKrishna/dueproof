"""Table tests for the date parser and the deadline gate."""
import unittest
from datetime import date

from dueproof_engine.pipeline.analyze import date_reading, date_rule, deadline_in, parse_date
from dueproof_engine.pipeline.analyzers import analyzer

BASE = date(2026, 8, 6)

PARSES = [
    # ISO and numeric
    ("Issued 2026-08-21 at head office", "2026-08-21"),
    ("due 21/08/2026", "2026-08-21"),
    ("due 21.08.2026", "2026-08-21"),
    ("due 21-08-2026", "2026-08-21"),
    ("due 1/9/2026", "2026-09-01"),
    # English, day first
    ("on 21 August 2026", "2026-08-21"),
    ("on 21st August, 2026", "2026-08-21"),
    ("on 3rd Sep 2026", "2026-09-03"),
    ("on 2nd Feb. 2027", "2027-02-02"),
    ("by 21 AUGUST 2026", "2026-08-21"),
    # English, month first
    ("August 21, 2026", "2026-08-21"),
    ("Aug 21st 2026", "2026-08-21"),
    ("December 1 2026", "2026-12-01"),
    # Malayalam, year first (the usual order)
    ("2026 ഓഗസ്റ്റ് 21-ന് മുമ്പ്", "2026-08-21"),
    ("2026 ജൂലൈ 8 മുതൽ", "2026-07-08"),
    ("2026 സെപ്റ്റംബർ 30-നകം", "2026-09-30"),
    ("2026 ആഗസ്റ്റ് 5", "2026-08-05"),            # alternative spelling
    ("2026 ഒക്‌ടോബർ 2", "2026-10-02"),            # with ZWNJ
    # Malayalam, day first and month first
    ("21 ഓഗസ്റ്റ് 2026", "2026-08-21"),
    ("ഡിസംബർ 15, 2026", "2026-12-15"),
    # OCR leaves stray marks and punctuation clinging to the month name
    ("2026 ഓഗസ്റ്റ്് 21", "2026-08-21"),
    ("2026 ഓഗസ്റ്റ്. 21", "2026-08-21"),
    ("21 ഓഗസ്റ്റ്, 2026", "2026-08-21"),
    ("21 - ഓഗസ്റ്റ് - 2026", "2026-08-21"),
    # Indian wordings: month abbreviations between hyphens, "Sept", "day of"
    ("latest by 20-Oct-2026", "2026-10-20"),
    ("on 20 Sept 2026", "2026-09-20"),
    ("on 20 Sept. 2026", "2026-09-20"),
    ("on the 20th day of October 2026", "2026-10-20"),
    ("on the 20th day of October, 2026", "2026-10-20"),
    # two-digit years are read as 20xx
    ("due 20/10/26", "2026-10-20"),
    ("due 20.10.26", "2026-10-20"),
    ("due 20-10-26", "2026-10-20"),
    ("latest by 20-Oct-26", "2026-10-20"),
    # first date wins within a pattern
    ("between 2026-08-01 and 2026-08-31", "2026-08-01"),
]

REJECTS = [
    "no date here at all",
    "31/02/2026 is not a day",                 # impossible date
    "on 32 August 2026",
    "13/13/2026",
    "Clause 4.2.1 of the agreement",
    "Ref NMR/SAF/2026/041",
    "invoice 20260821 total 4,50,000",
    "August 2026",                             # no day
    "Clause 12.3.45 of the agreement",         # a clause, not a two-digit-year date
    "see 4.2.10 and 1.2.26",
    "2026 ഓഗസ്റ്റ്",                            # no day
]

RELATIVE = [
    ("within 15 days of this circular", "2026-08-21"),
    ("Within 2 weeks", "2026-08-20"),
    ("within 1 month", "2026-09-05"),
    ("15 ദിവസത്തിനകം", "2026-08-21"),
]

DEADLINES = [
    ("Submit the report on or before 21 August 2026.", "2026-08-21"),
    ("Close out not later than 2026-09-01.", "2026-09-01"),
    ("Complete by 21/08/2026.", "2026-08-21"),
    ("Rectify within 15 days.", "2026-08-21"),
    ("റിപ്പോർട്ട് 2026 ഓഗസ്റ്റ് 21-ന് മുമ്പ് സമർപ്പിക്കണം.", "2026-08-21"),
    ("2026 സെപ്റ്റംബർ 30-നകം പൂർത്തിയാക്കണം.", "2026-09-30"),
]

NOT_DEADLINES = [
    "This circular was issued on 6 August 2026.",        # an issue date
    "The inspection took place on 21/07/2026.",
    "Meeting held 2026-07-30 at Corporate Office.",
    "2026 ജൂലൈ 8 മുതൽ പരിശോധന നടന്നു.",                # "from", not "by"
    "Submit the report to the Safety Officer.",           # a duty with no date
]


class ParseDate(unittest.TestCase):
    def test_patterns(self):
        for text, want in PARSES:
            with self.subTest(text=text):
                self.assertEqual(parse_date(text), want)

    def test_rejects(self):
        for text in REJECTS:
            with self.subTest(text=text):
                self.assertIsNone(parse_date(text))

    def test_relative_needs_a_base(self):
        for text, want in RELATIVE:
            with self.subTest(text=text):
                self.assertEqual(parse_date(text, BASE), want)
                self.assertIsNone(parse_date(text))

    def test_the_first_date_in_the_text_wins_not_the_first_pattern(self):
        # Moved from the demo's test_ops.py. ISO is the first pattern tried; it must not jump the queue.
        self.assertEqual(parse_date("Dated 16 August 2026, payment due 2026-09-15"), "2026-08-16")
        self.assertEqual(parse_date("2026 ഓഗസ്റ്റ് 6-ന് പുറപ്പെടുവിച്ചു; due 21/08/2026"), "2026-08-06")
        self.assertEqual(parse_date("due 21/08/2026 (issued 2026-08-06)"), "2026-08-21")
        self.assertEqual(parse_date("ref 31/02/2026 then 5 March 2026 then 2026-01-01"), "2026-03-05")

    def test_ocr_glued_day_and_month(self):
        # PP-OCR often drops the space between a day and its month.
        self.assertEqual(parse_date("on or before 21August 2026."), "2026-08-21")
        self.assertIsNone(parse_date("2026August 3"))

    def test_absolute_beats_relative(self):
        self.assertEqual(parse_date("within 15 days, i.e. by 30 August 2026", BASE), "2026-08-30")


# C1: the date the duty applies to, not the first date in the sentence.
WHICH_DATE = [
    ("You are hereby directed to furnish your reply within 30 days from the date of this notice "
     "dated 24.10.2026 failing which the case will be decided ex parte.",
     {"type": "relative", "anchor": "issue", "amount": 30, "unit": "days"}),
    ("With reference to your reply dated 01.10.2026, you are directed to appear before the "
     "undersigned on or before 20.11.2026 with books of account.",
     {"type": "fixed", "date": "2026-11-20"}),
    ("You must pay the tax of Rs. 4,52,300 due for the period 01.04.2025 to 31.03.2026 within "
     "15 days of receipt of this notice.",
     {"type": "relative", "anchor": "receipt", "amount": 15, "unit": "days"}),
    ("The personal hearing earlier fixed on 25.11.2026 is preponed and you are directed to appear "
     "in person for hearing on 10.11.2026 at 11 AM.",
     {"type": "fixed", "date": "2026-11-10"}),
    ("In response to the notice dated 05.09.2026 you are required to submit the documents "
     "latest by 15-Oct-2026.",
     {"type": "fixed", "date": "2026-10-15"}),
    ("A personal hearing is fixed on 05.11.2026 at 11:30 AM; the earlier hearing fixed on "
     "20.10.2026 stands adjourned.",
     {"type": "fixed", "date": "2026-11-05"}),
    ("The hearing fixed on 20.10.2026 is adjourned to 05.11.2026 at 11:30 AM in this office.",
     {"type": "fixed", "date": "2026-11-05"}),
    ("The hearing is postponed from 20.10.2026 to 05.11.2026.", {"type": "fixed", "date": "2026-11-05"}),
    ("Reply within 15 days, i.e. by 30 August 2026.", {"type": "fixed", "date": "2026-08-30"}),
    ("Submit the return for the quarter 01.07.2026 to 30.09.2026 on or before 31 October 2026.",
     {"type": "fixed", "date": "2026-10-31"}),
]

# Sentences that hold two candidates: no rule, and flagged for a person.
DOUBTFUL = [
    "You are requested to furnish the reply within 45 days or by 20.12.2026, whichever is earlier.",
    "Reply by 30 November 2026, within 30 days of receipt.",
    "Failure to reply within 30 days will attract penalty; the return for the period was due on 20.10.2025.",
    "Submit the returns on or before 01.04.2026 and on or before 01.05.2026.",
    "Pay the demand within 30 (fifteen) days of service of this order.",
    "Please reply to the notice dated 01.10.2026 by return post.",
]

# H7: how Indian notices word a period.
PERIODS = [
    ("Pay the demand within 30 (thirty) days of service of this order.",
     {"type": "relative", "anchor": "service", "amount": 30, "unit": "days"}),
    ("Pay the demand within thirty (30) days of service of this order.",
     {"type": "relative", "anchor": "service", "amount": 30, "unit": "days"}),
    ("An appeal may be filed within three months from the date on which this order is communicated.",
     {"type": "relative", "anchor": "service", "amount": 3, "unit": "months"}),
    ("Submit your reply within a period of thirty days from the date of receipt of this letter.",
     {"type": "relative", "anchor": "receipt", "amount": 30, "unit": "days"}),
    ("Submit your reply not later than 15 days from the date of receipt of this letter.",
     {"type": "relative", "anchor": "receipt", "amount": 15, "unit": "days"}),
    ("Submit your reply within fifteen days.",
     {"type": "relative", "anchor": "issue", "amount": 15, "unit": "days"}),
    ("Submit your reply within forty-five days.",
     {"type": "relative", "anchor": "issue", "amount": 45, "unit": "days"}),
]


class WhichDate(unittest.TestCase):
    def test_the_date_the_duty_applies_to(self):
        for text, want in WHICH_DATE:
            with self.subTest(text=text[:60]):
                self.assertEqual(date_reading(text), (want, False))

    def test_two_candidates_are_not_guessed_at(self):
        for text in DOUBTFUL:
            with self.subTest(text=text[:60]):
                self.assertEqual(date_reading(text), (None, True))
                self.assertIsNone(deadline_in(text, BASE, BASE))

    def test_a_plain_deadline_is_not_doubtful(self):
        self.assertEqual(date_reading("Submit the report on or before 21 August 2026."),
                         ({"type": "fixed", "date": "2026-08-21"}, False))
        self.assertEqual(date_reading("The inspection took place on 21/07/2026."), (None, False))

    def test_periods_in_words_and_figures(self):
        for text, want in PERIODS:
            with self.subTest(text=text[:60]):
                self.assertEqual(date_rule(text), want)

    def test_hindi_month_names_in_the_notices_profile(self):
        rules = analyzer("notices_in")
        self.assertEqual(rules.parse_date("20 अक्टूबर 2026"), "2026-10-20")
        self.assertEqual(rules.parse_date("२० अक्तूबर २०२६"), "2026-10-20")
        self.assertEqual(rules.parse_date("5 सितम्बर 2026"), "2026-09-05")


class DeadlineGate(unittest.TestCase):
    def test_marked_dates_are_deadlines(self):
        for text, want in DEADLINES:
            with self.subTest(text=text):
                self.assertEqual(deadline_in(text, BASE), want)

    def test_unmarked_dates_are_not(self):
        for text in NOT_DEADLINES:
            with self.subTest(text=text):
                self.assertIsNone(deadline_in(text, BASE))


if __name__ == "__main__":
    unittest.main()
