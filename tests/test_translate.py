"""The data-sovereignty claim, as tests: no remote code, no network, pinned weights."""
import hashlib
import os
import re
import socket
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from dueproof import config
from tests.support import PKG, REPO
from dueproof.pipeline import translate

ROOT = REPO
VENDORED = PKG / "pipeline" / "indictrans2"
# git blob ids of the three files at MT_REVISION, as Hugging Face serves them.
UPSTREAM_BLOBS = {
    "configuration_indictrans.py": "110d923f8fffda96398f05c30e00f94e341670ec",
    "modeling_indictrans.py": "efbe438f6f1e8f57bd0652e9458f2755adb87900",
    "tokenization_indictrans.py": "53c9be07a1dda3273ed8c2af4f30b635edff4b31",
}

def own_sources():
    for path in ROOT.rglob("*.py"):
        rel = path.relative_to(ROOT)
        if rel.parts[0] in ("tests", "models", ".venv", "data") or VENDORED in path.parents:
            continue
        yield rel, path.read_text(encoding="utf-8")

def weights_present() -> bool:
    try:
        translate.verify(translate.model_dir())
        return True
    except translate.ModelUnavailable:
        return False


class Sovereignty(unittest.TestCase):
    def test_no_trust_remote_code_in_any_call(self):
        for rel, src in own_sources():
            with self.subTest(file=str(rel)):
                self.assertIsNone(re.search(r"trust_remote_code\s*=", src))

    def test_no_auto_classes(self):
        """Auto* resolves a class from dueproof.config.json's auto_map — the remote-code path."""
        for rel, src in own_sources():
            with self.subTest(file=str(rel)):
                self.assertNotRegex(src, r"\bAuto(Model\w*|Tokenizer|Config)\b")

    def test_revision_is_a_full_commit_sha(self):
        self.assertRegex(config.MT_REVISION, r"^[0-9a-f]{40}$")

    def test_libraries_are_told_they_are_offline(self):
        self.assertEqual(os.environ["HF_HUB_OFFLINE"], "1")
        self.assertEqual(os.environ["TRANSFORMERS_OFFLINE"], "1")

    def test_only_the_fetch_script_can_go_online(self):
        for rel, src in own_sources():
            if str(rel) == "dueproof/fetch_model.py":
                self.assertIn('allow_patterns=sorted(MT_FILES)', src)   # data files only
                continue
            with self.subTest(file=str(rel)):
                self.assertNotRegex(src, r'HF_HUB_OFFLINE"\]\s*=\s*"0"')
                self.assertNotRegex(src, r"\b(requests|urllib\.request|httpx)\b")
                for call in re.findall(r"snapshot_download\([^)]*\)", src):
                    self.assertIn("local_files_only=True", call)

    def test_vendored_code_is_byte_identical_to_the_pinned_revision(self):
        for name, blob in UPSTREAM_BLOBS.items():
            data = (VENDORED / name).read_bytes()
            got = hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()
            with self.subTest(file=name):
                self.assertEqual(got, blob)

    def test_no_python_among_the_weight_files(self):
        self.assertFalse([n for n in config.MT_FILES if n.endswith(".py")])
        for digest in config.MT_FILES.values():
            self.assertRegex(digest, r"^[0-9a-f]{64}$")


class Verify(unittest.TestCase):
    def test_missing_and_tampered_files_are_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(translate.ModelUnavailable, "missing"):
                translate.verify(Path(tmp))
            for name in config.MT_FILES:
                (Path(tmp) / name).write_bytes(b"not the reviewed weights")
            with self.assertRaisesRegex(translate.ModelUnavailable, "SHA-256"):
                translate.verify(Path(tmp))

    def test_unprovisioned_machine_degrades_without_translating(self):
        findings = [{"orig_lang": "ml", "text_local": "സുരക്ഷ", "text_en": None, "translated": False}]
        with mock.patch.dict(translate._state, {"loaded": False, "ok": False}, clear=True), \
                mock.patch.object(translate, "MT_ENABLED", True), \
                mock.patch.object(translate, "model_dir",
                                  side_effect=translate.ModelUnavailable("weights not found")), \
                self.assertLogs("dueproof.translate", "WARNING") as logs:
            out = translate.translate_findings(findings)
        self.assertEqual((out[0]["text_en"], out[0]["translated"]), (None, False))
        self.assertIn("weights not found", logs.output[0])

    def test_disabled_never_loads(self):
        with mock.patch.object(translate, "MT_ENABLED", False), \
                mock.patch.object(translate, "_load", side_effect=AssertionError("loaded")):
            translate.translate_findings([{"orig_lang": "ml", "text_local": "x", "text_en": None}])
            translate.warm()


class TerminologyCheck(unittest.TestCase):
    """Flag, never substitute: check_terms reports and leaves the text alone."""
    def flags(self, ml, en):
        return translate.check_terms(ml, en)

    def test_a_faithful_translation_raises_nothing(self):
        self.assertEqual(self.flags(
            "എല്ലാ എലിവേറ്റഡ് സ്റ്റേഷനുകളിലെയും അഗ്നിസുരക്ഷാ ഓഡിറ്റ് റിപ്പോർട്ട് 2026 സെപ്റ്റംബർ 5-ന് മുമ്പ് "
            "ചീഫ് സേഫ്റ്റി ഓഫീസർ മുഖേന സമർപ്പിക്കണം.",
            "The fire safety audit report of all elevated stations should be submitted "
            "through the Chief Safety Officer before 5th September, 2026."), [])

    def test_a_lost_domain_term_is_flagged_with_what_was_expected(self):
        got = self.flags("സ്റ്റേഷൻ കൺട്രോളർ റിപ്പോർട്ട് നൽകണം.", "The depot manager must give the report.")
        self.assertIn("സ്റ്റേഷൻ കൺട്രോളർ → station controller", got)
        self.assertIn("സ്റ്റേഷൻ → station", got)

    def test_inflected_forms_are_recognised(self):
        self.assertEqual(self.flags("സ്റ്റേഷനുകളിൽ പരിശോധന", "inspection at the stations"), [])
        self.assertEqual(self.flags("സ്റ്റേഷനുകളിൽ പരിശോധന", "inspection at the sites"),
                         ["സ്റ്റേഷന → station"])

    def test_any_accepted_equivalent_will_do(self):
        ml = "കമ്മീഷണർ ഓഫ് മെട്രോ റെയിൽ സേഫ്റ്റിക്ക് നൽകണം"
        self.assertEqual(self.flags(ml, "Submit to the Commissioner of Metro Rail Safety"), [])
        self.assertEqual(self.flags(ml, "submit to CMRS"), [])
        self.assertTrue(self.flags(ml, "submit to the commissioner"))

    def test_a_wrong_or_missing_number_is_flagged(self):
        ml = "റിപ്പോർട്ട് 2026 ഓഗസ്റ്റ് 21-ന് മുമ്പ് സമർപ്പിക്കണം."
        self.assertEqual(self.flags(ml, "Submit the report before 21st August 2026."), [])
        self.assertEqual(self.flags(ml, "Submit the report before 12th August 2026."), ["number 21"])
        self.assertEqual(self.flags(ml, "Submit the report before August."),
                         ["number 2026", "number 21"])
        self.assertEqual(self.flags(ml, "Submit the report before 21st August 2025."), ["number 2026"])

    def test_small_numbers_may_be_spelled_out(self):
        self.assertEqual(self.flags("3 ദിവസത്തിനകം", "within three days"), [])
        self.assertEqual(self.flags("5-ന് മുമ്പ്", "before the fifth"), [])
        self.assertEqual(self.flags("3 ദിവസത്തിനകം", "within thirteen days"), ["number 3"])
        self.assertEqual(self.flags("15 ദിവസത്തിനകം", "within fifteen days"), ["number 15"])

    def test_latin_names_inside_malayalam_must_survive(self):
        ml = "Maximo സിസ്റ്റത്തിൽ CBTC തകരാർ രേഖപ്പെടുത്തണം"
        self.assertEqual(self.flags(ml, "Record the CBTC fault in the Maximo system"), [])
        self.assertEqual(self.flags(ml, "Record the signalling fault in the maximum system"),
                         ["Maximo", "CBTC"])
        self.assertEqual(self.flags("OCCUPANCY സർട്ടിഫിക്കറ്റ്", "occupancy certificate"), [])  # not OCC

    def test_each_flag_appears_once_and_text_is_untouched(self):
        ml, en = "സ്റ്റേഷൻ സ്റ്റേഷൻ 21 21", "nothing relevant"
        self.assertEqual(self.flags(ml, en), ["സ്റ്റേഷൻ → station", "number 21"])
        self.assertEqual(en, "nothing relevant")

    def test_findings_carry_their_flags(self):
        findings = [{"orig_lang": "ml", "text_local": "സ്റ്റേഷൻ 21", "text_en": None,
                     "translated": False},
                    {"orig_lang": "en", "text_local": None, "text_en": "station", "translated": False}]
        with mock.patch.object(translate, "MT_ENABLED", True), \
                mock.patch.object(translate, "_load", return_value=True), \
                mock.patch.object(translate, "translate", return_value=["the depot on the 21st"]):
            out = translate.translate_findings(findings)
        self.assertEqual(out[0]["term_flags"], ["സ്റ്റേഷൻ → station"])
        self.assertTrue(out[0]["translated"])
        self.assertNotIn("term_flags", out[1])                     # English was never translated

    def test_vocabulary_is_well_formed(self):
        from dueproof import profiles
        for ml, expected in profiles.TERMS.items():
            self.assertRegex(ml, r"[ഀ-ൿ]")
            self.assertTrue(expected and all(e == e.casefold() for e in expected), ml)


@unittest.skipUnless(weights_present(), "IndicTrans2 weights not provisioned on this machine")
class Offline(unittest.TestCase):
    def test_loads_and_translates_with_the_network_cut(self):
        """Every outbound connection raises. Loading and translating still work."""
        def refuse(*a, **k):
            raise AssertionError(f"network access attempted: {a}")
        with mock.patch.object(socket.socket, "connect", refuse), \
                mock.patch.object(socket.socket, "connect_ex", refuse), \
                mock.patch.object(socket, "create_connection", refuse), \
                mock.patch.object(socket, "getaddrinfo", refuse):
            self.assertTrue(translate._load())
            out = translate.translate([
                ("ml", "റിപ്പോർട്ട് 2026 ഓഗസ്റ്റ് 21-ന് മുമ്പ് സമർപ്പിക്കണം."),
                ("ml", "എല്ലാ സ്റ്റേഷനുകളിലും അഗ്നിസുരക്ഷാ പരിശോധന നടത്തണം.")])
        self.assertEqual(len(out), 2)
        self.assertRegex(out[0], r"(?i)report")
        self.assertRegex(out[0], r"21")
        self.assertRegex(out[0], r"(?i)august")
        self.assertRegex(out[1], r"(?i)fire")
        self.assertNotRegex(" ".join(out), r"[ഀ-ൿ]")       # English came out, not Malayalam
        # The real model, on a clean sentence, loses neither the date nor the terms.
        self.assertEqual(translate.check_terms(
            "റിപ്പോർട്ട് 2026 ഓഗസ്റ്റ് 21-ന് മുമ്പ് സമർപ്പിക്കണം.", out[0]), [])
        self.assertEqual(translate.check_terms(
            "എല്ലാ സ്റ്റേഷനുകളിലും അഗ്നിസുരക്ഷാ പരിശോധന നടത്തണം.", out[1]), [])


@unittest.skipUnless(weights_present(), "IndicTrans2 weights not provisioned on this machine")
class Concurrency(unittest.TestCase):
    def test_two_workers_translating_at_once_both_finish(self):
        """Two uploads in the same second put both workers in the translator.
        Unserialised, the preprocessor deadlocks and both documents hang at
        'Translating' for ever."""
        import threading
        self.assertTrue(translate._load())
        texts = [("ml", "റിപ്പോർട്ട് 2026 ഓഗസ്റ്റ് 21-ന് മുമ്പ് സമർപ്പിക്കണം."),
                 ("ml", "എല്ലാ സ്റ്റേഷനുകളിലും അഗ്നിസുരക്ഷാ പരിശോധന നടത്തണം.")] * 2
        results = []
        threads = [threading.Thread(target=lambda: results.append(translate.translate(texts)),
                                    daemon=True) for _ in range(3)]
        [t.start() for t in threads]
        [t.join(timeout=120) for t in threads]
        self.assertFalse(any(t.is_alive() for t in threads), "translation deadlocked")
        self.assertEqual(len(results), 3)
        for out in results:
            self.assertEqual(len(out), 4)
            self.assertTrue(all(out))
        self.assertEqual(results[0], results[1])


if __name__ == "__main__":
    unittest.main()
