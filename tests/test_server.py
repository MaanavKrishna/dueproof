"""Server correctness: one clock, idempotent ingest, pagination, restart
recovery, resource caps."""
import os
import sqlite3
import tempfile
import threading
import time
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from unittest import mock


from dueproof import config
from dueproof import db
from dueproof import profiles
from tests.support import PKG, CIRCULAR, INVOICE, client, ingest, make_pdf, upload, wait_done

from dueproof import app


class Clock(unittest.TestCase):
    def test_today_is_the_date_in_the_profile_timezone(self):
        utc = lambda *a: datetime(*a, tzinfo=timezone.utc)
        self.assertEqual(config.today(utc(2026, 8, 20, 18, 29)), date(2026, 8, 20))   # 23:59 IST
        self.assertEqual(config.today(utc(2026, 8, 20, 18, 30)), date(2026, 8, 21))   # 00:00 IST
        self.assertEqual(config.today(utc(2026, 12, 31, 20, 0)), date(2027, 1, 1))

    def test_host_timezone_is_ignored(self):
        saved = os.environ.get("TZ")
        try:
            dates = set()
            for tz in ("UTC", "America/Los_Angeles", "Pacific/Kiritimati", "Asia/Kolkata"):
                os.environ["TZ"] = tz
                time.tzset()
                dates.add(config.today(datetime(2026, 8, 20, 18, 30, tzinfo=timezone.utc)))
            self.assertEqual(dates, {date(2026, 8, 21)})
        finally:
            os.environ.pop("TZ", None) if saved is None else os.environ.__setitem__("TZ", saved)
            time.tzset()

    def test_no_naive_today_left_in_the_app(self):
        for name in ("app.py", "db.py", "pipeline/analyze.py"):
            self.assertNotIn("date.today()", (PKG / name).read_text(), name)

    def test_deadline_turns_overdue_at_midnight_ist(self):
        ingest(CIRCULAR)
        due = lambda: {i["due_date"]: (i["days_left"], i["overdue"])
                       for i in client().get("/api/deadlines").json()}
        with mock.patch.object(app, "today", return_value=date(2026, 8, 21)):
            self.assertEqual(due()["2026-08-21"], (0, False))
            self.assertEqual(client().get("/api/meta").json()["today"], "2026-08-21")
        with mock.patch.object(app, "today", return_value=date(2026, 8, 22)):
            self.assertEqual(due()["2026-08-21"], (-1, True))
            self.assertEqual(due()["2026-08-31"], (9, False))

    def test_days_window(self):
        with mock.patch.object(app, "today", return_value=date(2026, 8, 1)):
            near = client().get("/api/deadlines", params={"days": 20}).json()
            self.assertTrue(all(i["due_date"] <= "2026-08-21" for i in near))


class Ingest(unittest.TestCase):
    def test_same_bytes_are_admitted_once(self):
        data = make_pdf("idempotent")
        first = upload(data, "a.pdf").json()
        self.assertFalse(first["duplicate"])
        again = upload(data, "a.pdf").json()
        renamed = upload(data, "completely-different-name.pdf").json()
        self.assertEqual((again["doc_id"], again["duplicate"]), (first["doc_id"], True))
        self.assertEqual((renamed["doc_id"], renamed["duplicate"]), (first["doc_id"], True))
        self.assertEqual(wait_done(first["doc_id"])["status"], "done")
        self.assertEqual(db.one("SELECT COUNT(*) n FROM documents WHERE content_hash=?",
                                (app._sha256(config.UPLOADS / f"{first['doc_id']}.pdf"),))["n"], 1)

    def test_one_changed_byte_is_a_new_document(self):
        a, b = upload(make_pdf("variant-a")).json(), upload(make_pdf("variant-b")).json()
        self.assertNotEqual(a["doc_id"], b["doc_id"])
        self.assertFalse(b["duplicate"])
        for d in (a, b):
            wait_done(d["doc_id"])

    def test_concurrent_identical_uploads_make_one_row(self):
        data, out = make_pdf("race"), []
        threads = [threading.Thread(target=lambda: out.append(upload(data).json()))
                   for _ in range(8)]
        [t.start() for t in threads]
        [t.join() for t in threads]
        self.assertEqual(len({o["doc_id"] for o in out}), 1)
        self.assertEqual(sum(not o["duplicate"] for o in out), 1)
        wait_done(out[0]["doc_id"])

    def test_inbox_scan_is_idempotent_and_sees_through_renames(self):
        for p in config.INBOX.glob("*.pdf"):
            p.unlink()
        data = make_pdf("inbox-1")
        (config.INBOX / "WhatsApp-forward.pdf").write_bytes(data)
        (config.INBOX / "notes.txt").write_text("ignored")
        first = client().post("/api/inbox/scan").json()["started"]
        self.assertEqual([(s["filename"], s["channel"]) for s in first],
                         [("WhatsApp-forward.pdf", "WhatsApp")])
        wait_done(first[0]["doc_id"])
        self.assertEqual(client().post("/api/inbox/scan").json()["started"], [])
        (config.INBOX / "same-file-renamed.pdf").write_bytes(data)
        self.assertEqual(client().post("/api/inbox/scan").json()["started"], [])
        self.assertTrue((config.INBOX / "WhatsApp-forward.pdf").exists())     # copied, not moved

    def test_a_failed_document_can_be_resubmitted(self):
        bad = b"%PDF-1.7\nthis is not really a pdf " + os.urandom(64)
        first = upload(bad).json()
        row = wait_done(first["doc_id"])
        self.assertEqual(row["status"], "error")
        self.assertNotIn(str(config.UPLOADS), row["error"])        # no server path in the toast
        self.assertEqual(db.one("SELECT COUNT(*) n FROM findings WHERE doc_id=?",
                                (first["doc_id"],))["n"], 0)
        second = upload(bad).json()
        self.assertFalse(second["duplicate"])
        self.assertNotEqual(second["doc_id"], first["doc_id"])
        wait_done(second["doc_id"])
        s = client().get(f"/api/status/{first['doc_id']}").json()
        self.assertEqual((s["status"], s["done"], s["percent"]), ("error", True, 100))


class UploadValidation(unittest.TestCase):
    def test_not_a_pdf_is_refused_whatever_it_is_called(self):
        for body in (b"MZ\x90\x00 an executable", b"PK\x03\x04 a zip", b"<html>hello</html>",
                     b"x" * 2000 + b"%PDF-1.7"):                  # header too late to count
            with self.subTest(body=body[:12]):
                self.assertEqual(upload(body, "innocent.pdf").status_code, 415)

    def test_nothing_is_left_behind_by_a_refused_upload(self):
        upload(b"not a pdf", "x.pdf")
        upload(b"", "x.pdf")
        self.assertEqual(list(config.UPLOADS.glob("tmp-*")), [])

    def test_oversize_is_refused(self):
        with mock.patch.object(app, "MAX_UPLOAD_BYTES", 1024):
            self.assertEqual(upload(make_pdf("big") + b"\0" * 4096).status_code, 413)
        self.assertEqual(list(config.UPLOADS.glob("tmp-*")), [])

    def test_filename_and_channel_are_sanitised(self):
        got = upload(make_pdf("sanitise"), "../../etc/passwd.pdf", channel="<script>").json()
        wait_done(got["doc_id"])
        row = db.one("SELECT filename, source_channel FROM documents WHERE id=?", (got["doc_id"],))
        self.assertEqual(row, {"filename": "passwd.pdf", "source_channel": "Upload"})


class ResourceCaps(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def path(self, data: bytes) -> Path:
        p = Path(self.tmp.name) / "doc.pdf"
        p.write_bytes(data)
        return p

    def test_page_limit(self):
        from dueproof.pipeline import read
        with mock.patch.object(read, "MAX_PAGES", 2), self.assertRaisesRegex(ValueError, "limit is 2"):
            read.read_pdf("caps-pages", self.path(make_pdf("long", pages=3)))

    def test_password_protected_pdf(self):
        from dueproof.pipeline import read
        from tests.fixtures import FOLDER, LOCKED
        with self.assertRaisesRegex(ValueError, "password"):
            read.read_pdf("caps-locked", FOLDER / LOCKED)

    def test_not_a_pdf_at_all(self):
        from dueproof.pipeline import read
        with self.assertRaisesRegex(ValueError, "could not be read as a PDF"):
            read.read_pdf("caps-junk", self.path(b"%PDF-1.7 and then nothing useful"))

    def test_a_poster_sized_page_is_rendered_within_the_pixel_cap(self):
        from dueproof.pipeline import pdf
        from tests.fixtures import FOLDER, POSTER
        doc = pdf.open_pdf(FOLDER / POSTER)                  # 200 inches square
        img = pdf.render(doc[0], 300)                         # uncapped: 3.6 gigapixels
        self.assertLessEqual(img.shape[0] * img.shape[1], config.MAX_PAGE_PIXELS * 1.01)
        self.assertGreater(img.shape[0], 1000)

    def test_an_ordinary_page_keeps_its_dpi(self):
        from dueproof.pipeline import pdf
        doc = pdf.open_pdf(self.path(make_pdf("a4")))
        self.assertAlmostEqual(pdf.render(doc[0], 300).shape[1], 595 / 72 * 300, delta=1)


class Pagination(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        ingest(CIRCULAR), ingest(INVOICE)
        for d in [upload(make_pdf(f"page-{i}")).json() for i in range(4)]:
            wait_done(d["doc_id"])

    def get(self, **params):
        r = client().get("/api/documents", params=params)
        return r.json(), int(r.headers["X-Total-Count"])

    def test_pages_tile_the_full_list_in_order(self):
        everything, total = self.get(limit=500)
        self.assertEqual(len(everything), total)
        self.assertGreaterEqual(total, 6)
        tiled = []
        for offset in range(0, total, 2):
            page, n = self.get(limit=2, offset=offset)
            self.assertEqual(n, total)
            self.assertLessEqual(len(page), 2)
            tiled += page
        self.assertEqual([d["id"] for d in tiled], [d["id"] for d in everything])

    def test_newest_first(self):
        ids = [d["id"] for d in self.get(limit=500)[0]]
        order = [r["id"] for r in db.q("SELECT id FROM documents ORDER BY rowid DESC")]
        self.assertEqual(ids, order)

    def test_limits_are_clamped(self):
        self.assertEqual(len(self.get(limit=0)[0]), 1)
        self.assertEqual(len(self.get(limit=-5)[0]), 1)
        self.assertEqual(self.get(offset=-3)[0], self.get(offset=0)[0])
        self.assertEqual(self.get(offset=10_000)[0], [])
        self.assertLessEqual(len(self.get(limit=10_000)[0]), 500)

    def test_sql_filters_agree_with_a_plain_python_filter(self):
        everything, _ = self.get(limit=500)
        for role in profiles.ROLES + ["No such desk", "'; DROP TABLE documents;--"]:
            got, total = self.get(role=role, limit=500)
            want = [d["id"] for d in everything if role in d["roles"]]
            with self.subTest(role=role):
                self.assertEqual([d["id"] for d in got], want)
                self.assertEqual(total, len(want))
        for channel in config.CHANNELS:
            got, total = self.get(channel=channel, limit=500)
            want = [d["id"] for d in everything if d["source_channel"] == channel]
            with self.subTest(channel=channel):
                self.assertEqual(([d["id"] for d in got], total), (want, len(want)))
        both, _ = self.get(role="Safety Officer", channel="Upload", limit=500)
        self.assertEqual([d["id"] for d in both], [d["id"] for d in everything
                         if "Safety Officer" in d["roles"] and d["source_channel"] == "Upload"])
        self.assertTrue(db.one("SELECT COUNT(*) n FROM documents")["n"])     # table survived

    def test_filter_and_pagination_compose(self):
        full, total = self.get(role="Safety Officer", limit=500)
        page, n = self.get(role="Safety Officer", limit=1, offset=1)
        self.assertEqual((n, page[0]["id"]), (total, full[1]["id"]))

    def test_deadline_count_matches_the_findings(self):
        for d in self.get(limit=500)[0]:
            want = db.one("SELECT COUNT(*) n FROM findings WHERE doc_id=? AND kind='obligation'"
                          " AND due_date IS NOT NULL", (d["id"],))["n"]
            self.assertEqual(d["deadline_count"], want)

    def test_deadlines_paginate(self):
        r = client().get("/api/deadlines", params={"limit": 500})
        full, total = r.json(), int(r.headers["X-Total-Count"])
        self.assertEqual(len(full), total)
        tiled = [i for off in range(0, total, 3)
                 for i in client().get("/api/deadlines", params={"limit": 3, "offset": off}).json()]
        self.assertEqual([i["id"] for i in tiled], [i["id"] for i in full])


class Recovery(unittest.TestCase):
    def stuck(self, with_file: bool) -> str:
        doc_id = os.urandom(6).hex()
        if with_file:
            (config.UPLOADS / f"{doc_id}.pdf").write_bytes(make_pdf(f"stuck-{doc_id}"))
        db.run("INSERT INTO documents (id,filename,status,stage,percent) VALUES"
               " (?,?,'processing','Reading page 3 of 9',40)", (doc_id, "stuck.pdf"))
        # Half-written output from the interrupted run:
        db.run("INSERT INTO findings (id,doc_id,kind,evidence_quote) VALUES (?,?,'bullet','stale')",
               (f"{doc_id}-0", doc_id))
        return doc_id

    def test_a_document_caught_mid_process_is_finished_after_restart(self):
        doc_id = self.stuck(with_file=True)
        self.assertGreaterEqual(app.recover(), 1)
        self.assertEqual(wait_done(doc_id)["status"], "done")
        quotes = [r["evidence_quote"] for r in db.q(
            "SELECT evidence_quote FROM findings WHERE doc_id=?", (doc_id,))]
        self.assertTrue(quotes)
        self.assertNotIn("stale", quotes)

    def test_a_lost_upload_fails_loudly_instead_of_hanging(self):
        doc_id = self.stuck(with_file=False)
        app.recover()
        row = wait_done(doc_id, timeout=5)
        self.assertEqual(row["status"], "error")
        self.assertIn("lost", row["error"])
        self.assertEqual(db.one("SELECT COUNT(*) n FROM findings WHERE doc_id=?", (doc_id,))["n"], 0)

    def test_nothing_to_recover(self):
        app._JOBS.join()
        self.assertEqual(app.recover(), 0)

    def test_lifespan_runs_recovery_at_startup(self):
        from fastapi.testclient import TestClient
        doc_id = self.stuck(with_file=True)
        with TestClient(app.app):
            self.assertEqual(wait_done(doc_id)["status"], "done")


class Workers(unittest.TestCase):
    def test_pool_is_fixed_however_many_documents_arrive(self):
        for d in [upload(make_pdf(f"pool-{i}")).json() for i in range(5)]:
            wait_done(d["doc_id"])
        workers = [t for t in threading.enumerate() if t.name.startswith("dueproof-worker")]
        self.assertEqual(len(workers), app.WORKERS)


class Observability(unittest.TestCase):
    def test_every_response_carries_a_distinct_request_id(self):
        ids = {client().get("/api/meta").headers["X-Request-ID"] for _ in range(5)}
        self.assertEqual(len(ids), 5)
        self.assertIn("X-Request-ID", client().get("/api/document/nope").headers)

    def test_requests_are_logged_with_their_id_but_status_polls_are_not(self):
        with self.assertLogs("dueproof.app", "INFO") as logs:
            r = client().get("/api/meta")
            client().get("/api/status/nope")
        self.assertEqual(len(logs.records), 1)
        self.assertIn("GET /api/meta -> 200", logs.output[0])
        self.assertRegex(r.headers["X-Request-ID"], r"^[0-9a-f]{12}$")

    def test_health(self):
        app._JOBS.join()
        h = client().get("/health").json()
        self.assertEqual((h["status"], h["workers"], h["queue_depth"]), ("ok", 2, 0))
        self.assertEqual(h["translation"], "disabled")          # the suite runs with MT off
        self.assertEqual(h["today"], config.today().isoformat())
        self.assertGreaterEqual(h["documents"].get("done", 0), 1)

    def test_no_print_statements_left(self):
        for name in ("app.py", "db.py", "pipeline/read.py", "pipeline/analyze.py",
                     "pipeline/link.py", "pipeline/translate.py"):
            self.assertNotRegex((PKG / name).read_text(), r"(?m)^\s*print\(", name)


class Connections(unittest.TestCase):
    def test_schema_is_complete_and_init_is_idempotent(self):
        db.init()
        db.init()
        tables = {r["name"] for r in db.q("SELECT name FROM sqlite_master")}
        self.assertLessEqual({"documents", "findings", "duplicates", "pages", "audit", "dup_keys",
                              "search"}, tables)
        self.assertIn("content_hash", {r["name"] for r in db.q("PRAGMA table_info(documents)")})
        self.assertIn("text_local", {r["name"] for r in db.q("PRAGMA table_info(findings)")})

    def test_close_releases_the_thread_connection(self):
        seen = {}

        def use():
            db.one("SELECT 1")
            first = db.conn()
            db.close()
            seen["closed"] = getattr(db._local, "handle", None) is None
            with self.assertRaises(sqlite3.ProgrammingError):
                first.execute("SELECT 1")
            db.close()                              # closing twice is harmless
        t = threading.Thread(target=use)
        t.start()
        t.join()
        self.assertTrue(seen["closed"])


if __name__ == "__main__":
    unittest.main()
