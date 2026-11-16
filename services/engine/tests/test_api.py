"""The HTTP service end to end: auth, the five endpoints, storage I/O, errors.
Sources come from a local stand-in for signed-URL storage (tests/storage_server.py)."""
import io
import json
import os
import time
import unittest
from unittest import mock

from PIL import Image

from dueproof_engine.api import auth, models as m, service
from tests.fixtures import FOLDER, LOCKED, NOTICE, SCAN
from tests.storage_server import StorageServer
from tests.support import client, make_pdf, paddle_present

SECRET = os.environ["ENGINE_SHARED_SECRET"]


class Tokens(unittest.TestCase):
    def test_round_trip(self):
        claims = auth.verify_token(auth.make_token(SECRET, 60), SECRET.encode())
        self.assertEqual(claims["aud"], "engine")

    def test_refusals(self):
        now = time.time()
        key = SECRET.encode()
        cases = {
            "bad signature": auth.make_token("another-secret-" + "z" * 32, 60),
            "expired": auth.make_token(SECRET, -120),
            "lifetime too long": auth.make_token(SECRET, 24 * 3600),
            "wrong audience": auth.make_token(SECRET, 60, aud="app"),
            "malformed token": "not.a-token",
        }
        for message, tok in cases.items():
            with self.subTest(message), self.assertRaisesRegex(auth.AuthError, message):
                auth.verify_token(tok, key, now)
        head, body, sig = auth.make_token(SECRET, 60).split(".")
        none_alg = auth._b64e(b'{"alg":"none","typ":"JWT"}')
        with self.assertRaises(auth.AuthError):
            auth.verify_token(f"{none_alg}.{body}.{sig}", key)

    def test_endpoints_need_a_token_health_does_not(self):
        from fastapi.testclient import TestClient
        from dueproof_engine.app import app
        anon = TestClient(app)
        for path in ("/v1/inspect", "/v1/read", "/v1/translate", "/v1/analyze", "/v1/link"):
            with self.subTest(path=path):
                r = anon.post(path, json={})
                self.assertEqual((r.status_code, r.json()["error"]), (401, "unauthorised"))
                r = anon.post(path, json={}, headers={"Authorization": "Bearer " + auth.make_token(SECRET, -100)})
                self.assertEqual(r.status_code, 401)
        self.assertEqual(anon.get("/health").json()["status"], "ok")

    def test_no_secret_means_no_service(self):
        with mock.patch.dict(os.environ, {"ENGINE_SHARED_SECRET": "short"}):
            r = client().post("/v1/link", json={"pages": [], "quotes": []})
        self.assertEqual((r.status_code, r.json()["error"]), (503, "not_configured"))


class EndToEnd(unittest.TestCase):
    """inspect -> read -> analyze -> link on the GST notice, as the workflow calls them."""
    @classmethod
    def setUpClass(cls):
        cls.storage = StorageServer(FOLDER).__enter__()
        c = client()
        cls.inspect = c.post("/v1/inspect", json={"sourceUrl": cls.storage.url(NOTICE),
                                                  "mime": "application/pdf"}).json()
        cls.read = c.post("/v1/read", json={
            "sourceUrl": cls.storage.url(NOTICE), "mime": "application/pdf",
            "pageImagePutUrls": [cls.storage.url("img/notice/1.webp")]}).json()
        cls.analyze = c.post("/v1/analyze", json={"pages": cls.read["pages"],
                                                  "receivedOn": "2026-10-24",
                                                  "profile": "notices_in"}).json()
        cls.link = c.post("/v1/link", json={"pages": cls.read["pages"], "quotes": [
            {"id": str(i), "text": f["quote"], "pageHint": f["pageHint"]}
            for i, f in enumerate(cls.analyze["findings"])] + [
            {"id": "absent", "text": "This sentence is nowhere in the notice at all."}]}).json()

    @classmethod
    def tearDownClass(cls):
        cls.storage.__exit__(None, None, None)

    def test_inspect(self):
        self.assertEqual(self.inspect, {"ok": True, "pageCount": 1, "encrypted": False,
                                        "textLayerPages": [1]})

    def test_read_gives_words_in_points_and_puts_a_webp(self):
        m.ReadResponse.model_validate(self.read)
        page, = self.read["pages"]
        self.assertEqual((page["engine"], page["confidence"], page["width"], page["height"]),
                         ("text_layer", 1.0, 595.0, 842.0))
        self.assertEqual(self.read["needsEscalation"], [])
        self.assertIn("ASMT-10", page["text"])
        for w in page["words"]:
            x0, y0, x1, y1 = w["rect"]
            self.assertTrue(0 <= x0 < x1 <= 595 and 0 <= y0 < y1 <= 842, w)
        ctype, body = self.storage.stored["img/notice/1.webp"]
        self.assertEqual(ctype, "image/webp")
        self.assertEqual(Image.open(io.BytesIO(body)).format, "WEBP")

    def test_analyze_returns_rules_not_just_dates(self):
        a = self.analyze
        self.assertEqual((a["docType"], a["reference"], a["issuedOn"], a["confident"]),
                         ("GST notice", "ZD2910260012345", "2026-10-20", True))
        self.assertEqual(a["issuingOffice"], "Assistant Commissioner of State Tax")
        self.assertEqual(a["sections"], ["Section 61", "Section 73(1)"])
        by_kind = {}
        for f in a["findings"]:
            by_kind.setdefault(f["kind"], []).append(f)
        reply, = by_kind["deadline"]
        self.assertEqual(reply["dueRule"], {"type": "relative", "anchor": "receipt", "amount": 30,
                                            "unit": "days"})
        self.assertEqual(reply["engineDueOn"], "2026-11-23")
        self.assertEqual(reply["desk"], "GST & Indirect Tax")
        hearing, = by_kind["hearing"]
        self.assertEqual(hearing["dueRule"], {"type": "fixed", "date": "2026-11-18"})
        amount, = by_kind["amount"]
        self.assertEqual(amount["amountMinor"], 452300 * 100)
        texts = {p["page"]: " ".join(p["text"].split()) for p in self.read["pages"]}
        for f in a["findings"]:
            with self.subTest(quote=f["quote"][:40]):
                self.assertIn(" ".join(f["quote"].split()), texts[f["pageHint"]])   # verbatim

    def test_without_a_receipt_date_the_rule_stands_but_no_date(self):
        got = client().post("/v1/analyze", json={"pages": self.read["pages"]}).json()
        reply, = [f for f in got["findings"] if f["kind"] == "deadline"]
        self.assertEqual(reply["dueRule"]["anchor"], "receipt")
        self.assertNotIn("engineDueOn", reply)

    def test_link_proves_every_quote_and_refuses_to_guess(self):
        matches = {x["id"]: x for x in self.link["matches"]}
        for i in range(len(self.analyze["findings"])):
            hit = matches[str(i)]
            self.assertEqual((hit["grade"], hit["page"], hit["score"]), ("exact", 1, 1.0))
            self.assertTrue(hit["rects"])
            for x0, y0, x1, y1 in hit["rects"]:
                self.assertTrue(0 <= x0 < x1 <= 595 and 0 <= y0 < y1 <= 842)
        absent = matches["absent"]
        self.assertEqual((absent["grade"], absent["rects"]), ("unlocated", []))
        self.assertNotIn("page", absent)

    def test_no_nulls_on_the_wire(self):
        for body in (self.inspect, self.read, self.analyze, self.link):
            self.assertNotIn("null", json.dumps(body))

    def test_another_profile_per_request(self):
        got = client().post("/v1/analyze", json={"pages": self.read["pages"],
                                                 "profile": "general"}).json()
        self.assertNotEqual(got["docType"], "GST notice")
        bad = client().post("/v1/analyze", json={"pages": self.read["pages"], "profile": "../x"})
        self.assertEqual((bad.status_code, bad.json()["error"]), (422, "invalid_request"))


class Refusals(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.storage = StorageServer(FOLDER).__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.storage.__exit__(None, None, None)

    def post(self, path, **body):
        return client().post(path, json={"mime": "application/pdf", **body})

    def test_encrypted(self):
        r = self.post("/v1/inspect", sourceUrl=self.storage.url(LOCKED)).json()
        self.assertEqual((r["ok"], r["encrypted"], r["reason"]), (False, True, "encrypted"))
        r = self.post("/v1/read", sourceUrl=self.storage.url(LOCKED), pageImagePutUrls=[])
        self.assertEqual((r.status_code, r.json()["reason"]), (422, "encrypted"))

    def test_junk_and_unsupported(self):
        self.storage.extra["junk.pdf"] = b"%PDF-1.7 and then nothing useful"
        self.storage.extra["note.gif"] = b"GIF89a" + bytes(100)
        r = self.post("/v1/inspect", sourceUrl=self.storage.url("junk.pdf")).json()
        self.assertEqual((r["ok"], r["reason"]), (False, "malformed"))
        r = self.post("/v1/inspect", sourceUrl=self.storage.url("note.gif")).json()
        self.assertEqual((r["ok"], r["reason"]), (False, "unsupported"))

    def test_too_large_is_refused_while_streaming(self):
        self.storage.extra["big.pdf"] = make_pdf("big") + b"%" * 4096
        with mock.patch("dueproof_engine.config.MAX_SOURCE_BYTES", 2048):
            r = self.post("/v1/read", sourceUrl=self.storage.url("big.pdf"), pageImagePutUrls=[])
        self.assertEqual((r.status_code, r.json()["reason"]), (422, "too_large"))

    def test_too_many_pages(self):
        self.storage.extra["long.pdf"] = make_pdf("long", pages=4)
        with mock.patch("dueproof_engine.config.MAX_PAGES", 3):
            r = self.post("/v1/inspect", sourceUrl=self.storage.url("long.pdf")).json()
        self.assertEqual((r["ok"], r["pageCount"], r["reason"]), (False, 4, "too_many_pages"))

    def test_storage_failures_are_502(self):
        r = self.post("/v1/read", sourceUrl=self.storage.url("missing.pdf"), pageImagePutUrls=[])
        self.assertEqual((r.status_code, r.json()["error"]), (502, "storage"))
        r = self.post("/v1/read", sourceUrl=self.storage.url(NOTICE),
                      pageImagePutUrls=[self.storage.url("img/fail")])
        self.assertEqual(r.status_code, 502)

    def test_only_http_and_allowed_hosts(self):
        r = self.post("/v1/inspect", sourceUrl="file:///etc/passwd")
        self.assertEqual(r.status_code, 502)
        with mock.patch.dict(os.environ, {"DUEPROOF_ALLOWED_HOSTS": "*.r2.cloudflarestorage.com"}):
            r = self.post("/v1/inspect", sourceUrl=self.storage.url(NOTICE))
        self.assertEqual(r.status_code, 502)

    def test_invalid_body_does_not_echo_input(self):
        r = client().post("/v1/link", json={"pages": [{"page": 0, "text": "SECRET-DOCUMENT-TEXT"}],
                                            "quotes": []})
        self.assertEqual((r.status_code, r.json()["error"]), (422, "invalid_request"))
        self.assertNotIn("SECRET-DOCUMENT-TEXT", r.text)


class Ladder(unittest.TestCase):
    """maxRung caps the climb; what is left below the bar is reported."""
    @classmethod
    def setUpClass(cls):
        cls.storage = StorageServer(FOLDER).__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.storage.__exit__(None, None, None)

    def read(self, rung):
        return client().post("/v1/read", json={"sourceUrl": self.storage.url(SCAN), "mime": "application/pdf",
                                               "pageImagePutUrls": [], "maxRung": rung,
                                               "languages": ["en", "ml"]}).json()

    def test_text_layer_only_escalates_every_scanned_page(self):
        r = self.read("text_layer")
        self.assertEqual([p["engine"] for p in r["pages"]], ["none"] * 3)
        self.assertEqual(r["needsEscalation"], [1, 2, 3])

    @unittest.skipUnless(paddle_present(), "PaddleOCR models are not provisioned")
    def test_paddleocr_reads_english_and_escalates_the_malayalam(self):
        r = self.read("paddleocr")
        self.assertEqual({p["engine"] for p in r["pages"]}, {"paddleocr"})
        # Every page carries a Malayalam paragraph PP-OCR's recogniser cannot write.
        self.assertEqual(r["needsEscalation"], [1, 2, 3])
        a = client().post("/v1/analyze", json={"pages": r["pages"]}).json()
        dates = {f["dueRule"]["date"] for f in a["findings"] if f.get("dueRule", {}).get("type") == "fixed"}
        self.assertLessEqual({"2026-08-21", "2026-08-31"}, dates)
        # Words come back with lines and boxes, so OCR text can be proved.
        quotes = [{"id": str(i), "text": f["quote"], "pageHint": f["pageHint"]}
                  for i, f in enumerate(a["findings"]) if f["kind"] in ("deadline", "obligation")]
        link = client().post("/v1/link", json={"pages": r["pages"], "quotes": quotes}).json()
        self.assertTrue(all(x["grade"] in ("exact", "strong") and x["rects"] for x in link["matches"]))


class Translate(unittest.TestCase):
    def test_without_the_heavy_engine_the_text_comes_back_untouched(self):
        body = {"segments": [{"id": "1:0", "text": "സുരക്ഷാ റിപ്പോർട്ട്", "lang": "ml"},
                             {"id": "1:1", "text": "Plain English.", "lang": "en"}]}
        r = client().post("/v1/translate", json=body).json()
        self.assertEqual(r["engine"], "none")
        self.assertEqual([(s["id"], s["textEn"], s["warn"]) for s in r["segments"]],
                         [("1:0", "സുരക്ഷാ റിപ്പോർട്ട്", False), ("1:1", "Plain English.", False)])

    def test_with_a_translator_numbers_are_checked(self):
        from dueproof_engine.pipeline import translate as mt
        with mock.patch.object(mt, "available", return_value=True), \
                mock.patch.object(mt, "translate", return_value=["Submit by 12 August."]):
            r = service.translate(m.TranslateRequest(segments=[
                m.TranslateSegment(id="a", text="21 ഓഗസ്റ്റിന് മുമ്പ് സമർപ്പിക്കണം", lang="ml")]))
        self.assertEqual(r.engine, "indictrans2")
        self.assertEqual((r.segments[0].textEn, r.segments[0].warn), ("Submit by 12 August.", True))


if __name__ == "__main__":
    unittest.main()
