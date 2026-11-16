"""All 22 languages: the registry, recognition by script, and translate-first
analysis — a language with no vocabulary of its own still yields dated,
routed, provable obligations."""
import json
import re
import unittest

from dueproof_engine.languages import LANGUAGES, enabled
from dueproof_engine.pipeline import translate
from dueproof_engine.pipeline.analyze import analyze
from tests.support import CIRCULAR, corpus
from tests.test_profiles import run
from tests.test_translate import weights_present


# One duty, one deadline, in five languages and five scripts (Urdu is
# right-to-left; the Bengali uses its own digits).
SENTENCES = {
    "hi": "सभी विभागों को 21 अगस्त 2026 से पहले अग्नि सुरक्षा रिपोर्ट प्रस्तुत करनी होगी।",
    "ta": "அனைத்து துறைகளும் 2026 ஆகஸ்ட் 21 ஆம் தேதிக்கு முன் தீ பாதுகாப்பு அறிக்கையை சமர்ப்பிக்க வேண்டும்.",
    "bn": "সকল বিভাগকে ২১ আগস্ট ২০২৬ এর আগে অগ্নি নিরাপত্তা প্রতিবেদন জমা দিতে হবে।",
    "ur": "تمام محکموں کو 21 اگست 2026 سے پہلے فائر سیفٹی رپورٹ جمع کرانی ہوگی۔",
    "te": "అన్ని విభాగాలు 2026 ఆగస్టు 21 లోపు అగ్ని భద్రతా నివేదికను సమర్పించాలి.",
}

DETECT = """
    import json
    from dueproof_engine.pipeline.analyze import analyze, detect_lang
    S = json.loads(%r)
    gloss = "All departments shall submit the fire safety report on or before 21 August 2026."
    fake = lambda items: [gloss for _ in items]
    with_mt = analyze([S["ta"] + " " + S["hi"]], "x.pdf", translate=fake)
    print(json.dumps({
        "detect": {c: detect_lang(s) for c, s in S.items()},
        "english": detect_lang("The report shall be submitted."),
        "mixed": detect_lang("Maximo " + S["hi"]),
        "without": len(analyze([S["ta"]], "x.pdf")["obligations"]),
        "with": [(o["orig_lang"], o["due_date"], o["translated"], o["text_en"] == gloss,
                  o["text_local"] == o["evidence_quote"], o["roles"]) for o in with_mt["obligations"]],
    }, ensure_ascii=False))
"""

REAL = """
    import json
    from dueproof_engine.pipeline import translate
    from dueproof_engine.pipeline.analyze import analyze
    S = json.loads(%r)
    tr = translate.translator()
    out = {}
    for code, s in S.items():
        o = analyze([s], "x.pdf", translate=tr)["obligations"]
        out[code] = [(x["due_date"], x["orig_lang"], x["translated"], x["text_en"],
                      x["evidence_quote"] == s, translate.check_terms(s, x["text_en"])) for x in o]
    print(json.dumps(out, ensure_ascii=False))
"""


class Registry(unittest.TestCase):
    def test_all_twenty_two_languages(self):
        self.assertEqual(len(LANGUAGES), 22)
        self.assertEqual(len({lang["english"] for lang in LANGUAGES.values()}), 22)

    def test_every_entry_is_usable(self):
        for code, lang in LANGUAGES.items():
            with self.subTest(code=code):
                self.assertRegex(lang["mt"], r"^[a-z]{3}_[A-Z][a-z]{3}$")       # IndicTrans2 tag
                rx = re.compile(f"[{lang['script']}]")
                self.assertTrue(rx.search(lang["name"]), "its own name is not in its script")
                self.assertFalse(rx.search("plain English 123"))
                self.assertTrue(lang["font"].endswith(".ttf"))
                self.assertTrue(lang["ocr"] is None or re.fullmatch(r"[a-z]{3}", lang["ocr"]))

    def test_one_language_per_script_first_listed_wins(self):
        self.assertEqual([lang["code"] for lang in enabled(["mr", "hi", "ta", "ne"])], ["mr", "ta"])
        self.assertEqual([lang["code"] for lang in enabled(["hi", "mr"])], ["hi"])
        everything = enabled(["all"])
        scripts = [lang["script"] for lang in everything]
        self.assertEqual(len(scripts), len(set(scripts)))
        self.assertEqual(everything[0]["code"], "hi")
        self.assertEqual(len(everything), 12)                    # twelve scripts among the 22

    def test_unknown_code(self):
        with self.assertRaisesRegex(SystemExit, "Unknown language 'xx'"):
            enabled(["hi", "xx"])
        self.assertEqual(enabled([]), [])


class ByScript(unittest.TestCase):
    """General profile, five languages switched on by environment alone."""
    @classmethod
    def setUpClass(cls):
        cls.proc = run(DETECT % json.dumps(SENTENCES), DUEPROOF_PROFILE="general",
                       DUEPROOF_LANGUAGES="hi,ta,bn,ur,te", DUEPROOF_TRANSLATE="0")
        cls.out = json.loads(cls.proc.stdout) if cls.proc.returncode == 0 else {}

    def setUp(self):
        self.assertEqual(self.proc.returncode, 0, self.proc.stderr[-1500:])

    def test_each_sentence_is_recognised(self):
        self.assertEqual(self.out["detect"], {c: c for c in SENTENCES})
        self.assertEqual(self.out["english"], "en")
        self.assertEqual(self.out["mixed"], "hi")                # code-mixed stays local

    def test_without_translation_an_unknown_language_yields_nothing(self):
        self.assertEqual(self.out["without"], 0)

    def test_with_translation_the_english_rules_read_it(self):
        found = {o[0]: o for o in self.out["with"]}
        self.assertEqual(set(found), {"ta", "hi"})
        for lang, due, translated, has_gloss, quote_is_original, roles in found.values():
            self.assertEqual((due, translated, has_gloss, quote_is_original),
                             ("2026-08-21", True, True, True))
            self.assertIn("Safety & Compliance", roles)


@unittest.skipUnless(weights_present(), "IndicTrans2 weights not provisioned on this machine")
class RealModel(unittest.TestCase):
    """The real translator, five languages, no per-language vocabulary at all."""
    @classmethod
    def setUpClass(cls):
        cls.proc = run(REAL % json.dumps(SENTENCES), DUEPROOF_PROFILE="general",
                       DUEPROOF_LANGUAGES="hi,ta,bn,ur,te")
        cls.out = json.loads(cls.proc.stdout) if cls.proc.returncode == 0 else {}

    def test_every_language_yields_the_dated_obligation(self):
        self.assertEqual(self.proc.returncode, 0, self.proc.stderr[-1500:])
        for code in SENTENCES:
            with self.subTest(code=code):
                (due, lang, translated, english, quote_is_original, flags), = self.out[code]
                self.assertEqual((due, lang, translated, quote_is_original),
                                 ("2026-08-21", code, True, True))
                self.assertRegex(english, r"(?i)report")
                self.assertEqual(flags, [])          # no number lost — Bengali digits included


class Numbers(unittest.TestCase):
    def test_digits_in_any_script_are_compared_by_value(self):
        self.assertEqual(translate.check_terms("২১ আগস্ট ২০২৬", "21 August 2026"), [])
        self.assertEqual(translate.check_terms("२१ अगस्त २०२६", "21 August 2026"), [])
        self.assertEqual(translate.check_terms("২১ আগস্ট ২০২৬", "12 August 2026"), ["number 21"])


class Glosses(unittest.TestCase):
    def test_line_translations_reach_the_findings_and_the_quote_stays_original(self):
        """/v1/analyze is given English per line ("page:line"), not a
        translator: local-language findings carry it, and the proof is still
        the original sentence."""
        from dueproof_engine.pipeline.read import read_pdf
        doc = read_pdf(corpus() / CIRCULAR, max_rung="text_layer")
        glosses = {(p, n): f"Zanzibar gloss: shall submit by 2031-01-0{n % 9 + 1}."
                   for p, text in enumerate(doc["page_texts"], 1)
                   for n, _ in enumerate(text.split("\n"))}
        found = analyze(doc["page_texts"], CIRCULAR, line_glosses=glosses)
        local = [f for f in found["obligations"] + found["summary"] if f["orig_lang"] == "ml"]
        self.assertTrue(local)
        for f in local:
            self.assertTrue(f["translated"])
            self.assertTrue(f["text_en"].startswith("Zanzibar gloss"))
            self.assertEqual(f["evidence_quote"], f["text_local"])
            self.assertRegex(f["text_local"], "[ഀ-ൿ]")
        english = [f for f in found["obligations"] + found["summary"] if f["orig_lang"] == "en"]
        self.assertTrue(english and not any(f["translated"] for f in english))

    def test_no_translator_means_no_glosses(self):
        self.assertIsNone(translate.translator())                # the suite runs with MT off
        result = analyze(["സുരക്ഷാ റിപ്പോർട്ട് 2026 ഓഗസ്റ്റ് 21-ന് മുമ്പ് സമർപ്പിക്കണം."], "x.pdf")
        self.assertEqual([(o["translated"], o["text_en"]) for o in result["obligations"]],
                         [(False, None)])


if __name__ == "__main__":
    unittest.main()
