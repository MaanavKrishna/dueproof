"""Sign-in: local accounts, proxy sign-in, CSRF, sessions, brute-force brake."""
import io
import sqlite3
import unittest
from contextlib import redirect_stdout
from unittest import mock

from fastapi.testclient import TestClient

from dueproof import app, auth, cli, db
from tests.support import CIRCULAR, ingest

PASSWORD = "correct horse battery"


def fresh_client(**headers) -> TestClient:
    return TestClient(app.app, headers=headers)


class Passwords(unittest.TestCase):
    def test_hash_and_check(self):
        h = auth.hash_password(PASSWORD)
        self.assertTrue(h.startswith("scrypt$"))
        self.assertTrue(auth.check_password(PASSWORD, h))
        self.assertFalse(auth.check_password(PASSWORD + "x", h))
        self.assertNotEqual(h, auth.hash_password(PASSWORD))          # salted

    def test_short_passwords_and_garbage_hashes(self):
        with self.assertRaisesRegex(ValueError, "10 characters"):
            auth.hash_password("short")
        for stored in (None, "", "plain", "scrypt$1$2", "md5$abc"):
            self.assertFalse(auth.check_password(PASSWORD, stored))


class LocalSignIn(unittest.TestCase):
    def setUp(self):
        patches = [mock.patch.object(auth, "AUTH", "local"), mock.patch.object(app, "AUTH", "local"),
                   mock.patch.object(app, "SECURE_COOKIES", False)]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        auth._FAILS.clear()
        self.email = f"user{len(db.q('SELECT id FROM users'))}@example.org"
        auth.add_user(self.email, "Asha", "Finance", PASSWORD)
        self.c = fresh_client(**{"X-Dueproof": "1"})

    def sign_in(self, password=PASSWORD, email=None):
        return self.c.post("/api/login", json={"email": email or self.email, "password": password})

    def test_everything_needs_a_session(self):
        self.assertEqual(self.c.get("/api/me").json(), {"signed_in": False})
        for path in ("/api/documents", "/api/deadlines", "/api/users", "/api/audit",
                     "/api/search?q=fire", "/api/export/deadlines.csv", "/api/page/x/1.jpg"):
            with self.subTest(path=path):
                self.assertEqual(self.c.get(path).status_code, 401)

    def test_public_paths(self):
        meta = self.c.get("/api/meta").json()
        self.assertEqual(meta["auth"], "local")
        self.assertFalse(meta["needs_setup"])
        self.assertEqual(self.c.get("/api/version").status_code, 200)
        self.assertEqual(self.c.get("/health").status_code, 200)
        self.assertEqual(self.c.get("/").status_code, 200)               # the sign-in screen

    def test_sign_in_use_and_sign_out(self):
        r = self.sign_in()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), {"email": self.email, "name": "Asha", "desk": "Finance",
                                    "is_admin": False})
        self.assertTrue(self.c.get("/api/me").json()["signed_in"])
        cookie = r.headers["set-cookie"].lower()
        for flag in ("httponly", "samesite=strict", "path=/"):
            self.assertIn(flag, cookie)
        self.assertEqual(self.c.get("/api/me").json()["email"], self.email)
        self.assertEqual(self.c.get("/api/documents").status_code, 200)
        token = self.c.cookies.get(auth.COOKIE)
        stored = [r["token_hash"] for r in db.q("SELECT token_hash FROM sessions")]
        self.assertNotIn(token, stored)                                  # only its hash is kept
        self.assertEqual(self.c.post("/api/logout").status_code, 200)
        self.c.cookies.set(auth.COOKIE, token)                           # replaying it fails
        self.assertEqual(self.c.get("/api/documents").status_code, 401)

    def test_wrong_and_unknown(self):
        self.assertEqual(self.sign_in("not the password").status_code, 401)
        self.assertEqual(self.sign_in(email="nobody@example.org").status_code, 401)
        self.assertEqual(self.sign_in("not the password").json()["detail"], "Wrong email or password")

    def test_brute_force_brake(self):
        for _ in range(auth.MAX_FAILS):
            self.sign_in("not the password")
        self.assertEqual(self.sign_in().status_code, 429)               # even the right one
        other = f"other{self.email}"
        auth.add_user(other, "Other", "", PASSWORD)
        self.assertEqual(self.sign_in(email=other).status_code, 200)     # others unaffected

    def test_csrf_header_is_required_for_changes(self):
        self.sign_in()
        bare = fresh_client()
        bare.cookies.set(auth.COOKIE, self.c.cookies.get(auth.COOKIE))
        self.assertEqual(bare.get("/api/documents").status_code, 200)    # reading is fine
        for method, path in (("post", "/api/logout"), ("post", "/api/inbox/scan"),
                             ("patch", "/api/findings/x"), ("post", "/api/login")):
            with self.subTest(path=path):
                r = getattr(bare, method)(path)
                self.assertEqual(r.status_code, 403)
                self.assertIn("X-Dueproof", r.json()["detail"])

    def test_disabled_reset_and_expired(self):
        self.sign_in()
        auth.set_disabled(self.email, True)
        self.assertEqual(self.c.get("/api/documents").status_code, 401)
        self.assertEqual(self.sign_in().status_code, 401)
        auth.set_disabled(self.email, False)
        self.sign_in()
        auth.set_password(self.email, "a brand new password")
        self.assertEqual(self.c.get("/api/documents").status_code, 401)  # signed out everywhere
        self.assertEqual(self.sign_in("a brand new password").status_code, 200)
        db.run("UPDATE sessions SET expires_at='2000-01-01 00:00:00'")
        self.assertEqual(self.c.get("/api/me").json(), {"signed_in": False})

    def test_audit_names_the_person(self):
        doc_id = ingest(CIRCULAR)
        self.sign_in()
        self.c.get(f"/api/document/{doc_id}")
        rows = db.q("SELECT actor, action FROM audit ORDER BY id DESC LIMIT 2")
        self.assertEqual(rows[0], {"actor": self.email, "action": "view_document"})
        self.assertEqual(rows[1], {"actor": self.email, "action": "sign_in"})

    def test_first_run_needs_setup(self):
        with mock.patch.object(db, "one", return_value=None):
            self.assertTrue(self.c.get("/api/meta").json()["needs_setup"])


class ProxySignIn(unittest.TestCase):
    def setUp(self):
        for p in (mock.patch.object(auth, "AUTH", "proxy"),
                  mock.patch.object(auth, "AUTH_HEADER", "X-Forwarded-User")):
            p.start()
            self.addCleanup(p.stop)
        self.c = fresh_client(**{"X-Dueproof": "1"})

    def test_calls_without_the_header_did_not_come_through_the_proxy(self):
        self.assertEqual(self.c.get("/api/documents").status_code, 401)
        self.assertEqual(self.c.get("/api/documents", headers={"X-Forwarded-User": ""}).status_code, 401)
        ok = self.c.get("/api/me", headers={"X-Forwarded-User": "ravi@example.org"})
        self.assertEqual((ok.status_code, ok.json()["email"]), (200, "ravi@example.org"))

    def test_a_known_user_brings_their_desk_and_a_disabled_one_is_refused(self):
        auth.add_user("meera@example.org", "Meera", "Legal & Compliance", None)
        me = self.c.get("/api/me", headers={"X-Forwarded-User": "meera@example.org"}).json()
        self.assertEqual(me["desk"], "Legal & Compliance")
        auth.set_disabled("meera@example.org", True)
        self.assertEqual(self.c.get("/api/documents", headers={"X-Forwarded-User": "meera@example.org"})
                         .status_code, 401)

    def test_audit_names_the_person(self):
        doc_id = ingest(CIRCULAR)
        self.c.get(f"/api/document/{doc_id}", headers={"X-Forwarded-User": "ravi@example.org"})
        row = db.one("SELECT actor FROM audit WHERE action='view_document' ORDER BY id DESC LIMIT 1")
        self.assertEqual(row["actor"], "ravi@example.org")

    def test_local_sign_in_is_not_offered(self):
        with mock.patch.object(app, "AUTH", "proxy"):
            r = self.c.post("/api/login", json={"email": "a@b.c", "password": "x"},
                            headers={"X-Forwarded-User": "a@b.c"})
        self.assertEqual(r.status_code, 404)


class SecurityHeaders(unittest.TestCase):
    def test_every_response_carries_them(self):
        c = fresh_client()
        for path in ("/", "/api/meta", "/app.js", "/api/document/nope"):
            with self.subTest(path=path):
                h = c.get(path).headers
                self.assertIn("script-src 'self'", h["content-security-policy"])
                self.assertIn("frame-ancestors 'none'", h["content-security-policy"])
                self.assertEqual(h["x-content-type-options"], "nosniff")
                self.assertEqual(h["x-frame-options"], "DENY")

    def test_the_report_gets_its_own_tighter_policy(self):
        ingest(CIRCULAR)
        h = fresh_client().get("/api/export/deadlines.html").headers
        self.assertEqual(h["content-security-policy"],
                         "default-src 'none'; img-src data:; style-src 'unsafe-inline'; "
                         "frame-ancestors 'none'")


class UsersCommand(unittest.TestCase):
    def run_cli(self, *args, stdin=""):
        out = io.StringIO()
        with mock.patch("sys.stdin", io.StringIO(stdin)), redirect_stdout(out):
            code = cli.main(list(args))
        return code, out.getvalue()

    def test_add_list_reset_disable(self):
        code, out = self.run_cli("users", "add", "cli@example.org", "--name", "Kiran",
                                 "--desk", "Finance", "--admin", "--password-stdin", stdin=PASSWORD + "\n")
        self.assertEqual((code, out.strip()), (0, "added cli@example.org"))
        self.assertTrue(auth.authenticate("cli@example.org", PASSWORD))
        listing = self.run_cli("users", "list")[1]
        self.assertRegex(listing, r"cli@example.org\s+Kiran\s+Finance\s+admin")
        self.run_cli("users", "reset", "cli@example.org", "--password-stdin", stdin="another long one\n")
        self.assertTrue(auth.authenticate("cli@example.org", "another long one"))
        self.run_cli("users", "disable", "cli@example.org")
        self.assertIsNone(auth.authenticate("cli@example.org", "another long one"))

    def test_mistakes_are_explained(self):
        for args, stdin, message in (
                (("users", "add", "not-an-email", "--password-stdin"), PASSWORD, "not an email"),
                (("users", "add", "x@example.org", "--desk", "Nope", "--password-stdin"), PASSWORD, "Unknown desk"),
                (("users", "add", "y@example.org", "--password-stdin"), "short", "10 characters"),
                (("users", "reset", "ghost@example.org", "--password-stdin"), PASSWORD, "No user"),
                (("users", "add"), "", "needs an EMAIL")):
            with self.subTest(args=args), self.assertRaisesRegex(SystemExit, message):
                self.run_cli(*args, stdin=stdin + "\n")
        self.run_cli("users", "add", "dup@example.org", "--password-stdin", stdin=PASSWORD + "\n")
        with self.assertRaisesRegex(SystemExit, "already exists"):
            self.run_cli("users", "add", "DUP@example.org", "--password-stdin", stdin=PASSWORD + "\n")

    def test_proxy_only_accounts_have_no_password(self):
        self.run_cli("users", "add", "proxy@example.org", "--no-password")
        self.assertIsNone(db.one("SELECT pw_hash FROM users WHERE email='proxy@example.org'")["pw_hash"])
        self.assertIsNone(auth.authenticate("proxy@example.org", ""))


class FreshInstall(unittest.TestCase):
    def test_the_first_command_on_an_empty_data_folder_works(self):
        """`dueproof users add` is usually the very first thing run."""
        from tests.test_profiles import run
        p = run("from dueproof import auth; auth.add_user('first@example.org', 'First', '', "
                "'a long enough password', admin=True); print('ok')")
        self.assertEqual(p.stdout.strip(), "ok", p.stderr[-1500:])


class TableIntegrity(unittest.TestCase):
    def test_edit_history_is_append_only(self):
        db.run("INSERT INTO finding_edits (finding_id, actor, field) VALUES ('f','a','status')")
        with self.assertRaisesRegex(sqlite3.DatabaseError, "append-only"):
            db.run("UPDATE finding_edits SET actor='someone else'")
        db.conn().rollback()


if __name__ == "__main__":
    unittest.main()
