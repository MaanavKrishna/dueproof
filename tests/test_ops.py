"""Backups that restore, and the fixes from the code review."""
import shutil
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from dueproof import config
from dueproof import db
from dueproof.pipeline.analyze import parse_date
from dueproof.tools import backup
from tests.support import CIRCULAR, client, ingest, make_pdf, upload, wait_done

from dueproof import ingest as ingestion


class Backup(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.hero = ingest(CIRCULAR)
        ingestion._JOBS.join()
        cls.tmp = tempfile.mkdtemp(prefix="dueproof-backup-")
        cls.snap = backup.backup(Path(cls.tmp) / "out")

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_a_fresh_backup_verifies(self):
        self.assertEqual(backup.verify(self.snap), [])

    def test_restore_reproduces_the_corpus(self):
        target = Path(self.tmp) / "restored"
        backup.restore(self.snap, target)
        got = sqlite3.connect(target / config.DB_PATH.name)
        for table in ("documents", "findings", "pages", "duplicates", "dup_keys", "audit"):
            snap_n = sqlite3.connect(self.snap / config.DB_PATH.name).execute(
                f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            with self.subTest(table=table):
                self.assertEqual(got.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0], snap_n)
        self.assertTrue(got.execute("SELECT COUNT(*) FROM search WHERE search MATCH '\"extinguisher\"'")
                        .fetchone()[0])                    # the search index came with it
        got.close()
        self.assertEqual((target / "pages" / self.hero / "3.jpg").read_bytes(),
                         (config.PAGES / self.hero / "3.jpg").read_bytes())
        self.assertEqual(backup.verify(target), [])        # a restored tree is itself a valid backup

    def test_restore_will_not_overwrite_without_force(self):
        target = Path(self.tmp) / "occupied"
        backup.restore(self.snap, target)
        with self.assertRaisesRegex(SystemExit, "--force"):
            backup.restore(self.snap, target)
        backup.restore(self.snap, target, force=True)

    def damaged(self, name):
        copy = Path(self.tmp) / name
        shutil.copytree(self.snap, copy)
        return copy

    def test_a_missing_original_is_caught(self):
        copy = self.damaged("no-original")
        (copy / "uploads" / f"{self.hero}.pdf").unlink()
        self.assertIn(f"{self.hero}: original missing", backup.verify(copy))

    def test_a_tampered_original_is_caught(self):
        copy = self.damaged("tampered")
        with (copy / "uploads" / f"{self.hero}.pdf").open("ab") as fh:
            fh.write(b"\n% one extra byte")
        self.assertIn(f"{self.hero}: original does not match its recorded hash", backup.verify(copy))

    def test_a_missing_page_image_is_caught(self):
        copy = self.damaged("no-page")
        (copy / "pages" / self.hero / "2.jpg").unlink()
        self.assertTrue(any("page image(s) missing: [2]" in p for p in backup.verify(copy)))

    def test_a_damaged_backup_is_never_restored(self):
        copy = self.damaged("refused")
        (copy / "pages" / self.hero / "1.jpg").unlink()
        target = Path(self.tmp) / "never"
        with self.assertRaisesRegex(SystemExit, "damaged"):
            backup.restore(copy, target)
        self.assertFalse(target.exists())
        self.assertEqual(backup.verify(Path(self.tmp) / "nothing-here"), ["dueproof.db is missing"])

    def test_cli(self):
        self.assertEqual(backup.main([]), 2)
        self.assertEqual(backup.main(["verify", str(self.snap)]), 0)
        self.assertEqual(backup.main(["verify", str(self.damaged("cli")) + "/uploads"]), 1)


class ReviewFixes(unittest.TestCase):
    def test_the_first_date_in_the_text_wins_not_the_first_pattern(self):
        # ISO is the first pattern tried; it must not jump the queue.
        self.assertEqual(parse_date("Dated 16 August 2026, payment due 2026-09-15"), "2026-08-16")
        self.assertEqual(parse_date("2026 ഓഗസ്റ്റ് 6-ന് പുറപ്പെടുവിച്ചു; due 21/08/2026"), "2026-08-06")
        self.assertEqual(parse_date("due 21/08/2026 (issued 2026-08-06)"), "2026-08-21")
        self.assertEqual(parse_date("ref 31/02/2026 then 5 March 2026 then 2026-01-01"), "2026-03-05")

    def test_an_oversized_body_is_refused_before_it_is_read(self):
        with mock.patch.object(config, "MAX_UPLOAD_BYTES", 1024), \
                mock.patch.object(ingestion, "enqueue", side_effect=AssertionError("body was processed")):
            r = upload(b"%PDF-1.7" + b"\0" * (3 << 20))
        self.assertEqual(r.status_code, 413)
        self.assertIn("limit", r.json()["detail"])
        self.assertIn("X-Request-ID", r.headers)

    def test_upload_hashes_once_while_streaming(self):
        data = make_pdf("stream-hash")
        with mock.patch.object(ingestion, "_sha256", side_effect=AssertionError("file was re-read")):
            got = upload(data).json()
        wait_done(got["doc_id"])
        import hashlib
        self.assertEqual(db.one("SELECT content_hash h FROM documents WHERE id=?",
                                (got["doc_id"],))["h"], hashlib.sha256(data).hexdigest())

    def test_a_worker_outlives_a_failure_it_could_not_report(self):
        with mock.patch.object(ingestion, "_process", side_effect=RuntimeError("database is locked")):
            ingestion._JOBS.put(("ghost", Path("ghost.pdf"), "ghost.pdf"))
            ingestion._JOBS.put(("ghost2", Path("ghost.pdf"), "ghost.pdf"))
            ingestion._JOBS.put(("ghost3", Path("ghost.pdf"), "ghost.pdf"))
            ingestion._JOBS.join()
        got = upload(make_pdf("after-the-storm")).json()
        self.assertEqual(wait_done(got["doc_id"], timeout=30)["status"], "done")

    def test_connections_use_wal_with_normal_sync(self):
        self.assertEqual(db.one("PRAGMA journal_mode")["journal_mode"], "wal")
        self.assertEqual(db.one("PRAGMA synchronous")["synchronous"], 1)

    def test_health_is_reachable(self):
        self.assertEqual(client().get("/health").json()["status"], "ok")


if __name__ == "__main__":
    unittest.main()
