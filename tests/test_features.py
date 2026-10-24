"""Search, export and the audit log."""
import csv
import io
import sqlite3
import unittest
from datetime import date


from dueproof import config
from dueproof import db
from dueproof import export
from dueproof.pipeline.link import _norm_text
from tests.support import CIRCULAR, INVOICE, client, ingest, make_pdf, upload, wait_done


def search(q, **params):
    return client().get("/api/search", params={"q": q, **params})


class Search(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.hero, cls.invoice = ingest(CIRCULAR), ingest(INVOICE)

    def hits(self, q, **params):
        r = search(q, **params)
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()["hits"]

    def test_english_term_finds_its_pages(self):
        hits = self.hits("extinguisher")
        self.assertTrue(hits)
        self.assertIn(self.hero, {h["doc_id"] for h in hits})
        for h in hits:
            self.assertIn("extinguisher", h["snippet"].lower())
            self.assertTrue(h["title"] and h["page"] >= 1)

    def test_case_insensitive(self):
        self.assertEqual([(h["doc_id"], h["page"]) for h in self.hits("EXTINGUISHER")],
                         [(h["doc_id"], h["page"]) for h in self.hits("extinguisher")])

    def test_malayalam_substring_matches_inside_inflected_words(self):
        """The reason for trigrams: the stem must find the agglutinated form."""
        stem = "സ്റ്റേഷനുക"                      # inside സ്റ്റേഷനുകളിലെയും
        hits = self.hits(stem)
        self.assertIn(self.hero, {h["doc_id"] for h in hits})
        self.assertTrue(all(stem in h["snippet"] or h["rects"] for h in hits))

    def test_every_page_hit_is_outlined_on_the_right_words(self):
        for term in ("extinguisher", "അഗ്നിസുരക്ഷ", "audit"):
            for h in (h for h in self.hits(term) if not h["finding_id"]):
                with self.subTest(term=term, doc=h["doc_id"], page=h["page"]):
                    self.assertTrue(h["rects"])
                    words = db.jload(db.one("SELECT words FROM pages WHERE doc_id=? AND page_num=?",
                                            (h["doc_id"], h["page"]))["words"])
                    covered = ""
                    for x0, y0, x1, y1 in h["rects"]:
                        self.assertTrue(0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1)
                        covered += "".join(_norm_text(w[0]) for w in words
                                           if x0 <= (w[1] + w[3]) / 2 <= x1
                                           and y0 <= (w[2] + w[4]) / 2 <= y1)
                    self.assertIn(_norm_text(term), covered)

    def test_occurrence_count_matches_the_page(self):
        h = next(h for h in self.hits("extinguisher") if h["doc_id"] == self.hero)
        text = db.one("SELECT text FROM pages WHERE doc_id=? AND page_num=?",
                      (self.hero, h["page"]))["text"]
        self.assertGreaterEqual(len(h["rects"]), min(text.lower().count("extinguisher"), 20))

    def test_all_terms_must_match(self):
        both = self.hits("invoice payment")
        self.assertTrue(both)
        for h in both:
            body = db.one("SELECT text FROM pages WHERE doc_id=? AND page_num=?",
                          (h["doc_id"], h["page"]))["text"].lower()
            self.assertTrue("invoice" in body and "payment" in body)
        self.assertEqual(self.hits("invoice zzzqqqxxx"), [])

    def test_short_words_are_dropped_not_fatal(self):
        r = search("of extinguisher")
        self.assertEqual(r.json()["terms"], ["extinguisher"])
        self.assertTrue(r.json()["hits"])

    def test_too_short_a_query_is_refused(self):
        for q in ("", "  ", "ab", "a b c", "ab cd"):
            with self.subTest(q=q):
                self.assertEqual(search(q).status_code, 400)

    def test_nothing_found(self):
        self.assertEqual(self.hits("zzzqqqxxx"), [])

    def test_query_syntax_cannot_break_out(self):
        for q in ('" OR 1=1 --', 'NEAR(fire audit)', "fire*", 'a"b"c"d', "fire AND NOT audit",
                  "'; DROP TABLE documents;--", "{fire}", "col:fire", "^fire", "((((", "fire -audit",
                  "%%%", "___", "\\\\\\"):
            with self.subTest(q=q):
                self.assertIn(search(q).status_code, (200, 400))
        self.assertTrue(db.one("SELECT COUNT(*) n FROM documents")["n"])

    def test_limit_is_clamped(self):
        self.assertEqual(len(self.hits("the", limit=1)), 1)
        self.assertEqual(len(self.hits("the", limit=0)), 1)
        self.assertLessEqual(len(self.hits("the", limit=10_000)), 100)

    def test_a_translated_finding_is_found_by_its_english(self):
        f = db.one("SELECT id, page_num FROM findings WHERE doc_id=? AND orig_lang='ml'", (self.hero,))
        db.run("INSERT INTO search (body, doc_id, page_num, finding_id) VALUES (?,?,?,?)",
               ("The zebrafinch audit report shall be submitted.", self.hero, f["page_num"], f["id"]))
        try:
            hit, = self.hits("zebrafinch")
            self.assertEqual((hit["finding_id"], hit["doc_id"], hit["page"]),
                             (f["id"], self.hero, f["page_num"]))
        finally:
            db.run("DELETE FROM search WHERE finding_id=?", (f["id"],))

    def test_only_finished_documents_are_searchable(self):
        got = upload(make_pdf("quetzalcoatl")).json()
        wait_done(got["doc_id"])
        self.assertTrue(self.hits("quetzalcoatl"))
        db.run("UPDATE documents SET status='error' WHERE id=?", (got["doc_id"],))
        self.assertEqual(self.hits("quetzalcoatl"), [])
        db.forget(got["doc_id"])
        db.run("UPDATE documents SET status='done' WHERE id=?", (got["doc_id"],))
        self.assertEqual(self.hits("quetzalcoatl"), [])          # forget() cleared the index


class CsvExport(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.hero = ingest(CIRCULAR)

    def rows(self, **params):
        r = client().get("/api/export/deadlines.csv", params=params)
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.content.startswith(b"\xef\xbb\xbf"))           # Excel needs the BOM
        return r, list(csv.DictReader(io.StringIO(r.content.decode("utf-8-sig"))))

    def test_matches_the_compliance_line_row_for_row(self):
        r, rows = self.rows()
        line = client().get("/api/deadlines").json()
        self.assertEqual(list(rows[0]), export.COLUMNS)
        self.assertEqual([x["Due date"] for x in rows], [i["due_date"] for i in line])
        self.assertEqual([x["Page"] for x in rows], [str(i["page"]) for i in line])
        self.assertIn("text/csv", r.headers["content-type"])
        self.assertIn(f'dueproof-deadlines-{config.today().isoformat()}.csv',
                      r.headers["content-disposition"])

    def test_malayalam_survives_the_round_trip(self):
        _, rows = self.rows()
        ml = [x for x in rows if x["Written in"] == "Malayalam"]
        self.assertTrue(ml)
        originals = {i["text_local"] for i in client().get("/api/deadlines").json() if i["text_local"]}
        self.assertTrue(all(x["Original wording"] in originals for x in ml))

    def test_role_filter(self):
        _, mine = self.rows(role="Safety Officer")
        self.assertTrue(mine and all("Safety Officer" in x["Desks"] for x in mine))
        self.assertEqual(self.rows(role="No such desk")[1], [])

    def test_formula_cells_are_defused(self):
        for bad in ("=HYPERLINK(\"http://evil\",\"x\")", "+1+1", "-2+3", "@SUM(A1)", "\tx", "\rx"):
            self.assertEqual(export._cell(bad), "'" + bad)
        for fine in ("Submit by 5 Sept", "2026-09-05", "സമർപ്പിക്കണം", "", None, 12, "a=b"):
            self.assertFalse(export._cell(fine).startswith("'"))

    def test_formula_in_a_document_cannot_reach_the_spreadsheet(self):
        db.run("INSERT INTO findings (id,doc_id,kind,text_en,due_date,roles,page_num,rects_json,"
               "match_score,orig_lang,severity) VALUES ('evil-0',?,'obligation',"
               "'=cmd|''/c calc''!A1','2026-01-01','[\"=Finance\"]',1,'[]',0,'en','high')", (self.hero,))
        try:
            _, rows = self.rows()
            evil = next(x for x in rows if "cmd" in x["Obligation"])
            self.assertTrue(evil["Obligation"].startswith("'="))
            self.assertTrue(evil["Desks"].startswith("'="))
            self.assertFalse(any(v[:1] in "=+-@" for x in rows for v in x.values() if v
                                 and not v.lstrip("-").isdigit()))
        finally:
            db.run("DELETE FROM findings WHERE id='evil-0'")

    def test_unknown_format(self):
        self.assertEqual(client().get("/api/export/deadlines.xlsx").status_code, 404)


class EvidenceReport(unittest.TestCase):
    """The printable report: every obligation above its outlined passage."""
    @classmethod
    def setUpClass(cls):
        cls.hero = ingest(CIRCULAR)
        cls.response = client().get("/api/export/deadlines.html")
        cls.html = cls.response.text
        cls.line = client().get("/api/deadlines").json()

    def test_is_a_complete_html_page(self):
        self.assertEqual(self.response.status_code, 200)
        self.assertIn("text/html", self.response.headers["content-type"])
        self.assertTrue(self.html.startswith("<!doctype html>"))
        self.assertIn("Save as PDF", self.html)
        self.assertNotIn("<script", self.html)

    def test_every_obligation_is_listed_with_its_date_and_page(self):
        self.assertIn(f"{len(self.line)} dated obligation", self.html)
        for i in self.line:
            self.assertIn(date.fromisoformat(i["due_date"]).strftime("%d %b %Y"), self.html)
            self.assertIn(f"page {i['page']}", self.html)

    def test_every_located_obligation_carries_its_crop_inline(self):
        self.assertEqual(self.html.count('src="data:image/jpeg;base64,'),
                         sum(1 for i in self.line if i["rects"]))
        self.assertNotIn("could not be located", self.html)

    def test_local_language_text_is_marked_with_its_language(self):
        self.assertRegex(self.html, r'lang="ml">[\u0d00-\u0d7f]')

    def test_crop_outlines_only_the_matched_lines(self):
        import cv2
        import numpy as np
        i = next(i for i in self.line if i["rects"])
        full = cv2.imread(str(config.PAGES / i["doc_id"] / f"{i['page']}.jpg"))
        crop = cv2.imdecode(np.frombuffer(export._crop(i["doc_id"], i["page"], i["rects"]),
                                          np.uint8), cv2.IMREAD_COLOR)
        self.assertLess(crop.shape[0], full.shape[0] * 0.5)              # a strip, not the page
        self.assertAlmostEqual(crop.shape[1], full.shape[1] * 0.94, delta=3)

    def test_unlocated_and_empty_cases(self):
        self.assertIsNone(export._crop(self.hero, 1, []))
        self.assertIsNone(export._crop("no-such-doc", 1, [[0.1, 0.1, 0.2, 0.2]]))
        item = dict(self.line[0], rects=[], confidence="none", translated=True,
                    term_flags=["number 21"], days_left=-1, overdue=True)
        page = export.evidence_html([item], date(2026, 9, 1), "Finance")
        for want in ("could not be located", "Machine translation", "Check terminology: number 21",
                     "1 day overdue", "desk: Finance", "1 dated obligation ", "01 Sep 2026"):
            self.assertIn(want, page)
        self.assertNotIn("data:image", page)
        self.assertIn("0 dated obligations", export.evidence_html([], date(2026, 9, 1)))

    def test_markup_in_a_document_is_escaped(self):
        item = dict(self.line[0], text_en="<img src=x><b>bold</b> & <script>1</script>",
                    doc_title="<h1>T</h1>")
        page = export.evidence_html([item], date(2026, 9, 1))
        self.assertIn("&lt;img src=x&gt;&lt;b&gt;bold&lt;/b&gt; &amp; &lt;script&gt;", page)
        self.assertNotIn("<script>1", page)
        self.assertNotIn("<h1>T</h1>", page)

    def test_the_server_pdf_is_gone(self):
        self.assertEqual(client().get("/api/export/deadlines.pdf").status_code, 404)


class Audit(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.hero = ingest(CIRCULAR)

    def last(self, action):
        return db.one("SELECT * FROM audit WHERE action=? ORDER BY id DESC LIMIT 1", (action,))

    def count(self):
        return db.one("SELECT COUNT(*) n FROM audit")["n"]

    def test_viewing_a_document_is_recorded_against_the_request(self):
        r = client().get(f"/api/document/{self.hero}", params={"role": "Finance"})
        row = self.last("view_document")
        self.assertEqual((row["doc_id"], row["request_id"]), (self.hero, r.headers["X-Request-ID"]))
        self.assertEqual(row["actor"], "testclient")
        self.assertIn("Finance", row["detail"])
        self.assertRegex(row["at"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$")

    def test_upload_search_export_and_proof_are_recorded(self):
        got = upload(make_pdf("audited")).json()
        wait_done(got["doc_id"])
        self.assertEqual(self.last("upload")["doc_id"], got["doc_id"])
        search("extinguisher")
        self.assertIn("extinguisher", self.last("search")["detail"])
        client().get("/api/export/deadlines.csv")
        self.assertIn('"format": "csv"', self.last("export")["detail"])
        f = db.one("SELECT id FROM findings WHERE doc_id=?", (self.hero,))["id"]
        self.assertEqual(client().post(f"/api/audit/proof/{f}").status_code, 200)
        self.assertEqual(self.last("view_proof")["doc_id"], self.hero)
        self.assertEqual(client().post("/api/audit/proof/nope").status_code, 404)

    def test_misses_and_housekeeping_are_not_recorded(self):
        before = self.count()
        client().get("/api/document/nope")
        client().get("/api/meta")
        client().get(f"/api/status/{self.hero}")
        client().get("/health")
        client().get("/api/documents")
        search("ab")
        self.assertEqual(self.count(), before)

    def test_the_log_is_append_only(self):
        client().get(f"/api/document/{self.hero}")
        before = self.count()
        for sql in ("UPDATE audit SET actor='someone else'", "DELETE FROM audit",
                    "DELETE FROM audit WHERE id=1", "UPDATE audit SET at='2000-01-01' WHERE id=1"):
            with self.subTest(sql=sql), self.assertRaisesRegex(sqlite3.DatabaseError, "append-only"):
                db.run(sql)
            db.conn().rollback()
        self.assertEqual(self.count(), before)

    def test_trail_endpoint(self):
        client().get(f"/api/document/{self.hero}")
        trail = client().get("/api/audit", params={"doc_id": self.hero, "action": "view_document"}).json()
        self.assertTrue(trail)
        self.assertTrue(all(t["doc_id"] == self.hero and t["action"] == "view_document" for t in trail))
        ids = [t["id"] for t in client().get("/api/audit").json()]
        self.assertEqual(ids, sorted(ids, reverse=True))
        self.assertEqual(len(client().get("/api/audit", params={"limit": 1}).json()), 1)
        self.assertIsInstance(trail[0]["detail"], dict)


if __name__ == "__main__":
    unittest.main()
