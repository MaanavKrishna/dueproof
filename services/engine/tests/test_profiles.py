"""Profiles: the general (English-only) profile end to end, and the loader's
refusal of a broken one. Each runs in its own interpreter, because a profile is
chosen once, at import."""
import json
import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

GENERAL_RUN = """
    import json, os
    os.environ["ENGINE_SHARED_SECRET"] = "x" * 40
    from fastapi.testclient import TestClient
    from dueproof_engine import config
    from dueproof_engine.app import app
    from dueproof_engine.api.auth import make_token
    from dueproof_engine.api.service import page_model
    from dueproof_engine.pipeline import translate
    from dueproof_engine.pipeline.analyze import detect_lang, parse_date
    from dueproof_engine.pipeline.read import read_document
    from dueproof_engine.pipeline.scripts import clean, is_split_word
    from tests.pdfgen import pdf

    data = pdf([
        "Subject: Data retention policy for customer records\\n\\n"
        "The IT department shall encrypt every backup server and submit the access "
        "control review to the Legal team on or before 14 March 2027.\\n\\n"
        "Finance must clear the vendor invoice within 30 days, and the payment "
        "schedule will be reported to the board at the next quarterly meeting."])
    doc = read_document(data)
    c = TestClient(app, headers={"Authorization": "Bearer " + make_token(os.environ["ENGINE_SHARED_SECRET"])})
    pages = [page_model(p).model_dump() for p in doc["pages"]]
    got = c.post("/v1/analyze", json={"pages": pages, "profile": "general"}).json()
    print(json.dumps({
        "locals": [l["code"] for l in config.LOCALS], "ocr": config.tesseract_langs(),
        "health": c.get("/health").json()["translation"],
        "doc": {k: got.get(k) for k in ("title", "docType")}, "languages": doc["languages"],
        "findings": [(f["kind"], (f.get("dueRule") or {}).get("date"), f.get("desk"), f["quoteLang"])
                     for f in got["findings"]],
        "lang_of_malayalam": detect_lang("സുരക്ഷാ റിപ്പോർട്ട് സമർപ്പിക്കണം"),
        "local_date": parse_date("2026 ഓഗസ്റ്റ് 21"),
        "doubled_mark_repaired": clean("സുുരക്ഷ") == "സുരക്ഷ",
        "joins_split_word": is_split_word("സ്റ്റേഷ", "ൻ"),
        "translate_is_noop": translate.translate_findings(
            [{"orig_lang": "en", "text_en": "x"}]) == [{"orig_lang": "en", "text_en": "x"}],
    }, ensure_ascii=False))
"""


def run(code: str, **env) -> subprocess.CompletedProcess:
    with tempfile.TemporaryDirectory() as tmp:
        return subprocess.run(
            [sys.executable, "-c", textwrap.dedent(code)], capture_output=True, text=True, cwd=ROOT,
            env={"PATH": os.environ["PATH"], "HOME": tmp, "DUEPROOF_LOG_LEVEL": "CRITICAL",
                 "DUEPROOF_TRANSLATE": "0", **env})


class GeneralProfile(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.proc = run(GENERAL_RUN, DUEPROOF_PROFILE="general")
        cls.out = json.loads(cls.proc.stdout) if cls.proc.returncode == 0 else {}

    def setUp(self):
        self.assertEqual(self.proc.returncode, 0, self.proc.stderr[-2000:])

    def test_there_is_no_second_language_anywhere(self):
        o = self.out
        self.assertEqual(o["locals"], [])
        self.assertEqual((o["ocr"], o["health"]), ("eng", "none"))
        self.assertEqual(o["lang_of_malayalam"], "en")           # no local script to recognise
        self.assertIsNone(o["local_date"])                       # no local month names
        # Script repair is the reader's, not the profile's: it runs for every
        # script, and touches only its own.
        self.assertTrue(o["doubled_mark_repaired"] and o["joins_split_word"] and o["translate_is_noop"])
        self.assertEqual(o["languages"], ["en"])

    def test_an_english_document_is_read_dated_and_routed(self):
        self.assertEqual(self.out["doc"]["title"], "Data retention policy for customer records")
        self.assertEqual(self.out["doc"]["docType"], "Policy or circular")
        dated = {f[1]: f for f in self.out["findings"] if f[0] == "deadline" and f[1]}
        self.assertIn("2027-03-14", dated)
        self.assertEqual(dated["2027-03-14"][2], "IT & Security")
        self.assertTrue(all(f[3] == "en" for f in self.out["findings"]))
        # "within 30 days" with no anchor named runs from the issue date: a rule, no date.
        self.assertIn(("deadline", None), [(f[0], f[1]) for f in self.out["findings"]])


class Overrides(unittest.TestCase):
    def test_environment_overrides_the_profile_languages(self):
        p = run("from dueproof_engine import config; print([l['code'] for l in config.LOCALS])",
                DUEPROOF_PROFILE="general", DUEPROOF_LANGUAGES="ta,hi")
        self.assertEqual(p.stdout.strip(), "['ta', 'hi']")

    def test_default_profile_is_notices(self):
        p = run("from dueproof_engine import profiles, config; print(profiles.NAME, [l['code'] for l in config.LOCALS])")
        self.assertEqual(p.stdout.strip(), "notices_in ['hi']")


class Loader(unittest.TestCase):
    def test_unknown_and_malformed_names_are_refused_plainly(self):
        for name, message in (("nope", "No profile named 'nope'"), ("../etc", "not a profile name"),
                              ("os.path", "not a profile name")):
            p = run("from dueproof_engine import profiles", DUEPROOF_PROFILE=name)
            with self.subTest(name=name):
                self.assertNotEqual(p.returncode, 0)
                self.assertIn(message, p.stderr)
                self.assertNotIn("Traceback", p.stderr)

    def broken(self, body: str) -> str:
        path = ROOT / "dueproof_engine" / "profiles" / "zz_test_broken.py"
        path.write_text(textwrap.dedent(body), encoding="utf-8")
        self.addCleanup(path.unlink, missing_ok=True)
        return run("from dueproof_engine import profiles", DUEPROOF_PROFILE="zz_test_broken").stderr

    def test_a_profile_missing_a_required_list_says_which(self):
        self.assertIn("must define DEFAULT_ROLE", self.broken("""
            ROLES = ["A"]; ROLE_KEYWORDS = {}; DOC_TYPE_KEYWORDS = {}; OBLIGATION_CUES = []"""))

    def test_inconsistent_roles_are_caught_at_start_up(self):
        base = 'DOC_TYPE_KEYWORDS = {}; OBLIGATION_CUES = ["shall"]; ROLES = ["A"]\n'
        self.assertIn("DEFAULT_ROLE is not one of ROLES",
                      self.broken(base + 'ROLE_KEYWORDS = {}; DEFAULT_ROLE = "B"'))
        self.assertIn("unknown roles ['Z']",
                      self.broken(base + 'ROLE_KEYWORDS = {"Z": ["x"]}; DEFAULT_ROLE = "A"'))

    def test_an_unknown_language_is_caught(self):
        p = run("from dueproof_engine import config", DUEPROOF_LANGUAGES="hi,klingon")
        self.assertIn("Unknown language 'klingon'", p.stderr)
        self.assertNotIn("Traceback", p.stderr)

    def test_every_shipped_profile_loads(self):
        for path in sorted((ROOT / "dueproof_engine" / "profiles").glob("*.py")):
            if path.stem in ("__init__", "english") or path.stem.startswith("zz_"):
                continue
            p = run("from dueproof_engine import profiles; import dueproof_engine.pipeline.analyze; print(len(profiles.ROLES))",
                    DUEPROOF_PROFILE=path.stem)
            with self.subTest(profile=path.stem):
                self.assertEqual(p.returncode, 0, p.stderr[-800:])
                self.assertGreater(int(p.stdout), 0)


if __name__ == "__main__":
    unittest.main()
