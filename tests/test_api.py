"""The HTTP surface, against a temp database seeded through the real pipeline."""
import unittest

from dueproof import config
from tests.support import CIRCULAR, INVOICE, client, ingest


class PageImages(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.doc_id = ingest(CIRCULAR)
        # A real JPEG one level above data/pages: exactly what %2E%2E used to reach.
        cls.outside = config.DATA / "1.jpg"
        cls.outside.write_bytes((config.PAGES / cls.doc_id / "1.jpg").read_bytes())

    def test_serves_a_real_page(self):
        r = client().get(f"/api/page/{self.doc_id}/1.jpg")
        self.assertEqual((r.status_code, r.headers["content-type"]), (200, "image/jpeg"))

    def test_path_traversal_is_refused(self):
        self.assertTrue(self.outside.is_file())
        for doc in ("%2E%2E", "..", "%2e%2e", f"{self.doc_id}%2F..%2F..", "%2E%2E%2Fpages%2F..",
                    ".%2E", "....", "%252E%252E"):
            with self.subTest(doc=doc):
                r = client().get(f"/api/page/{doc}/1.jpg")
                self.assertEqual(r.status_code, 404)
                self.assertNotEqual(r.headers.get("content-type"), "image/jpeg")

    def test_missing_page_and_unknown_document(self):
        for path in (f"/api/page/{self.doc_id}/999.jpg", "/api/page/nope/1.jpg",
                     f"/api/page/{self.doc_id}/0.jpg", f"/api/page/{self.doc_id}/-1.jpg"):
            with self.subTest(path=path):
                self.assertEqual(client().get(path).status_code, 404)

    def test_non_numeric_page_is_rejected(self):
        self.assertEqual(client().get(f"/api/page/{self.doc_id}/abc.jpg").status_code, 422)


class Documents(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.hero, cls.invoice = ingest(CIRCULAR), ingest(INVOICE)

    def test_meta(self):
        m = client().get("/api/meta").json()
        self.assertEqual(len(m["roles"]), 10)
        self.assertIn("WhatsApp", m["channels"])
        self.assertEqual((m["product"], m["org"]), ("Dueproof", "Metro Rail"))
        self.assertEqual(m["locals"], [{"code": "ml", "name": "മലയാളം", "english": "Malayalam",
                                        "script": "\u0d00-\u0d7f"}])
        self.assertRegex(m["today"], r"^\d{4}-\d{2}-\d{2}$")

    def test_document_card(self):
        d = client().get(f"/api/document/{self.hero}").json()
        self.assertEqual(d["status"], "done")
        self.assertEqual(d["doc_type"], "Safety directive")
        self.assertEqual((len(d["bullets"]), len(d["obligations"])), (6, 5))
        self.assertNotIn("full_text", d)
        for f in d["bullets"] + d["obligations"]:
            self.assertEqual(f["confidence"], "exact")
            self.assertEqual(f["term_flags"], [])                 # nothing translated in the suite
            for r in f["rects"]:
                self.assertTrue(all(0 <= v <= 1 for v in r) and r[0] < r[2] and r[1] < r[3])

    def test_unknown_document_and_status(self):
        self.assertEqual(client().get("/api/document/nope").status_code, 404)
        self.assertEqual(client().get("/api/status/nope").status_code, 404)

    def test_status(self):
        s = client().get(f"/api/status/{self.hero}").json()
        self.assertEqual((s["status"], s["percent"], s["done"]), ("done", 100, True))

    def test_role_routing_reaches_finance(self):
        ids = lambda role: {d["id"] for d in client().get("/api/documents", params={"role": role}).json()}
        self.assertIn(self.invoice, ids("Finance"))
        self.assertNotIn(self.hero, ids("Finance"))
        self.assertIn(self.hero, ids("Safety Officer"))

    def test_channel_filter(self):
        self.assertEqual(client().get("/api/documents", params={"channel": "Maximo"}).json(), [])
        self.assertTrue(client().get("/api/documents", params={"channel": "Email"}).json())

    def test_deadlines_sorted_dated_and_role_filtered(self):
        items = client().get("/api/deadlines").json()
        self.assertTrue(items)
        self.assertEqual([i["due_date"] for i in items], sorted(i["due_date"] for i in items))
        for i in items:
            self.assertEqual(i["overdue"], i["days_left"] < 0)
        mine = client().get("/api/deadlines", params={"role": "Safety Officer"}).json()
        self.assertTrue(mine and all("Safety Officer" in i["roles"] for i in mine))
        self.assertEqual(client().get("/api/deadlines", params={"role": "No such desk"}).json(), [])


class Upload(unittest.TestCase):
    def test_rejects_an_empty_file(self):
        r = client().post("/api/upload", files={"file": ("empty.pdf", b"", "application/pdf")})
        self.assertEqual(r.status_code, 400)

    def test_requires_a_file(self):
        self.assertEqual(client().post("/api/upload").status_code, 422)


if __name__ == "__main__":
    unittest.main()
