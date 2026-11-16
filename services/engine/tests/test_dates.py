"""Table tests for the date parser and the deadline gate."""
import unittest
from datetime import date

from dueproof_engine.pipeline.analyze import deadline_in, parse_date

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
