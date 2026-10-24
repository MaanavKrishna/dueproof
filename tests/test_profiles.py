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
    import json, time
    from dueproof import config, db
    from dueproof.web.app import app
    from fastapi.testclient import TestClient
    from dueproof.pipeline import translate
    from dueproof.pipeline.analyze import detect_lang, parse_date
    from dueproof.pipeline.scripts import clean, is_split_word
    from tests.pdfgen import pdf

    data = pdf([
        "Subject: Data retention policy for customer records\\n\\n"
        "The IT department shall encrypt every backup server and submit the access "
        "control review to the Legal team on or before 14 March 2027.\\n\\n"
        "Finance must clear the vendor invoice within 30 days, and the payment "
        "schedule will be reported to the board at the next quarterly meeting."])
    c = TestClient(app, headers={"X-Dueproof": "1"})
    got = c.post("/api/upload", files={"file": ("policy.pdf", data,
                                                "application/pdf")}).json()
    while not c.get(f"/api/status/{got['doc_id']}").json()["done"]:
        time.sleep(0.05)
    card = c.get(f"/api/document/{got['doc_id']}").json()
    print(json.dumps({
        "meta": c.get("/api/meta").json(),
        "tz": str(config.TZ), "ocr": config.OCR_LANGS, "mt": config.MT_ENABLED,
        "health": c.get("/health").json()["translation"],
        "card": {k: card[k] for k in ("status", "title", "doc_type", "languages")},
        "findings": [(f["kind"], f["due_date"], f["roles"], f["orig_lang"], f["text_local"])
                     for f in card["bullets"] + card["obligations"]],
        "lang_of_malayalam": detect_lang("സുരക്ഷാ റിപ്പോർട്ട് സമർപ്പിക്കണം"),
        "local_date": parse_date("2026 ഓഗസ്റ്റ് 21"),
        "doubled_mark_kept": clean("സുുരക്ഷ") == "സുുരക്ഷ",
        "never_joins": not is_split_word("സ്റ്റേഷ", "ൻ"),
        "translate_is_noop": translate.translate_findings(
            [{"orig_lang": "en", "text_en": "x"}]) == [{"orig_lang": "en", "text_en": "x"}],
        "search": len(c.get("/api/search", params={"q": "encrypt"}).json()["hits"]),
        "csv": c.get("/api/export/deadlines.csv").content.decode("utf-8-sig").splitlines()[1],
        "report": c.get("/api/export/deadlines.html").text,
    }, ensure_ascii=False))
"""


def run(code: str, **env) -> subprocess.CompletedProcess:
    with tempfile.TemporaryDirectory() as tmp:
        return subprocess.run(
            [sys.executable, "-c", textwrap.dedent(code)], capture_output=True, text=True, cwd=ROOT,
            env={"PATH": os.environ["PATH"], "DUEPROOF_DATA": tmp, "DUEPROOF_AUTH": "none",
                 "DUEPROOF_LOG_LEVEL": "CRITICAL", **env})


class GeneralProfile(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.proc = run(GENERAL_RUN, DUEPROOF_PROFILE="general")
        cls.out = json.loads(cls.proc.stdout) if cls.proc.returncode == 0 else {}

    def setUp(self):
        self.assertEqual(self.proc.returncode, 0, self.proc.stderr[-2000:])

    def test_there_is_no_second_language_anywhere(self):
        o = self.out
        self.assertEqual(o["meta"]["locals"], [])
        self.assertEqual((o["ocr"], o["mt"], o["health"]), ("eng", False, "disabled"))
        self.assertEqual(o["lang_of_malayalam"], "en")           # no local script to recognise
        self.assertIsNone(o["local_date"])                       # no local month names
        self.assertTrue(o["doubled_mark_kept"] and o["never_joins"] and o["translate_is_noop"])
        self.assertEqual(o["card"]["languages"], ["en"])

    def test_generic_settings(self):
        self.assertEqual(self.out["tz"], "UTC")
        self.assertEqual((self.out["meta"]["product"], self.out["meta"]["org"]), ("Dueproof", ""))
        self.assertIn("IT & Security", self.out["meta"]["roles"])
        self.assertNotIn("Station Controller", self.out["meta"]["roles"])

    def test_an_english_document_is_read_dated_and_routed(self):
        self.assertEqual(self.out["card"]["status"], "done")
        self.assertEqual(self.out["card"]["title"], "Data retention policy for customer records")
        self.assertEqual(self.out["card"]["doc_type"], "Policy or circular")
        dated = {f[1]: f for f in self.out["findings"] if f[0] == "obligation" and f[1]}
        self.assertIn("2027-03-14", dated)
        self.assertIn("IT & Security", dated["2027-03-14"][2])
        self.assertTrue(all(f[3] == "en" and f[4] is None for f in self.out["findings"]))
        self.assertTrue(any("Finance" in f[2] for f in self.out["findings"]))

    def test_search_and_export_work_without_a_local_language(self):
        self.assertGreaterEqual(self.out["search"], 1)
        self.assertIn("2027-03-14", self.out["csv"])
        self.assertIn(",English,", self.out["csv"])
        self.assertIn("14 Mar 2027", self.out["report"])


class Overrides(unittest.TestCase):
    def test_environment_overrides_the_profile(self):
        p = run("from dueproof import config; print(config.TZ, '|', config.ORG_NAME)",
                DUEPROOF_PROFILE="general", DUEPROOF_TZ="Europe/Berlin", DUEPROOF_ORG="Acme GmbH")
        self.assertEqual(p.stdout.strip(), "Europe/Berlin | Acme GmbH")

    def test_default_profile_is_notices(self):
        p = run("from dueproof import profiles, config; print(profiles.NAME, [l['code'] for l in config.LOCALS])")
        self.assertEqual(p.stdout.strip(), "notices_in ['hi']")


class Loader(unittest.TestCase):
    def test_unknown_and_malformed_names_are_refused_plainly(self):
        for name, message in (("nope", "No profile named 'nope'"), ("../etc", "not a profile name"),
                              ("os.path", "not a profile name")):
            p = run("from dueproof import profiles", DUEPROOF_PROFILE=name)
            with self.subTest(name=name):
                self.assertNotEqual(p.returncode, 0)
                self.assertIn(message, p.stderr)
                self.assertNotIn("Traceback", p.stderr)

    def broken(self, body: str) -> str:
        path = ROOT / "dueproof" / "profiles" / "zz_test_broken.py"
        path.write_text(textwrap.dedent(body), encoding="utf-8")
        self.addCleanup(path.unlink, missing_ok=True)
        return run("from dueproof import profiles", DUEPROOF_PROFILE="zz_test_broken").stderr

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
        p = run("from dueproof import config", DUEPROOF_LANGUAGES="hi,klingon")
        self.assertIn("Unknown language 'klingon'", p.stderr)
        self.assertNotIn("Traceback", p.stderr)

    def test_every_shipped_profile_loads(self):
        for path in sorted((ROOT / "dueproof" / "profiles").glob("*.py")):
            if path.stem in ("__init__", "english") or path.stem.startswith("zz_"):
                continue
            p = run("from dueproof import profiles; import dueproof.pipeline.analyze; print(len(profiles.ROLES))",
                    DUEPROOF_PROFILE=path.stem)
            with self.subTest(profile=path.stem):
                self.assertEqual(p.returncode, 0, p.stderr[-800:])
                self.assertGreater(int(p.stdout), 0)


if __name__ == "__main__":
    unittest.main()
