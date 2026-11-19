"""Fuzz findings on the engine's only network I/O (api/storage.py).

1. Content-Encoding is decoded by httpx before the size cap is counted, and
   each network chunk is inflated whole. A 1.8 kB body sent with
   "Content-Encoding: gzip, gzip" inflates to 1 GiB inside one iter_bytes()
   step: about 3 GB resident before MAX_SOURCE_BYTES (80 MB) is checked. The
   app's upload URL (apps/app/lib/upload.ts -> s3.ts putSignedUrl) signs only
   content-type, so an uploader can probably store the object with any
   Content-Encoding, and R2 serves it back with that header (check this
   against R2).
2. FETCH_TIMEOUT is per read, not per request: a server that sends a byte
   every (timeout - 1) seconds holds the request for as long as it likes.
3. put() reads the whole PUT response body into memory (1 GiB here).
4. With DUEPROOF_ALLOWED_HOSTS unset (the default) any host is fetched:
   loopback, link-local metadata (169.254.169.254), private ranges, decimal
   and hex IP forms. With an allowlist the check is on the name only, never
   on the address it resolves to (DNS rebinding, or a wildcard entry that
   covers names someone else controls).
5. check_url() lets urlsplit's ValueError escape for a malformed bracketed
   host ("http://[::1/"), so the API answers 500 instead of 502 storage.
"""
import json
import os
import socket
import subprocess
import sys
import textwrap
import threading
import time
import unittest
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest import mock

from dueproof_engine import config
from dueproof_engine.api import storage
from dueproof_engine.pipeline.pdf import ReadError
from tests.support import token

ENGINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _gzip_zeros(n: int) -> bytes:
    z = zlib.compressobj(9, zlib.DEFLATED, 31)
    return b"".join(z.compress(b"\0" * (1 << 24)) for _ in range(n >> 24)) + z.flush()


GZ1 = _gzip_zeros(1 << 30)                                   # 1 GiB of zeros -> ~1 MB
_z = zlib.compressobj(9, zlib.DEFLATED, 31)
GZ2 = _z.compress(GZ1) + _z.flush()                          # gzip(gzip(1 GiB)) -> ~2 kB


class Hostile(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path == "/drip":
            self.send_response(200)
            self.send_header("Content-Length", "12")
            self.end_headers()
            for _ in range(12):
                try:
                    self.wfile.write(b"%")
                    self.wfile.flush()
                except OSError:
                    return
                time.sleep(0.5)
            return
        if self.path == "/gzip-gzip":
            self.send_response(200)
            self.send_header("Content-Encoding", "gzip, gzip")
            self.send_header("Content-Length", str(len(GZ2)))
            self.end_headers()
            try:
                self.wfile.write(GZ2)
            except OSError:
                pass
            return
        self.send_response(200)
        self.send_header("Content-Length", "4")
        self.end_headers()
        self.wfile.write(b"%PDF")

    def do_PUT(self):
        self.rfile.read(int(self.headers.get("Content-Length") or 0))
        self.send_response(200)
        self.send_header("Content-Length", str(1 << 30))
        self.end_headers()
        try:
            for _ in range(1024):
                self.wfile.write(b"x" * (1 << 20))
        except OSError:
            pass


class HostileStorage(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), Hostile)
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.httpd.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def _child(self, call: str) -> dict:
        """Run a storage call in a child limited to 1 GiB of address space."""
        prog = textwrap.dedent(f"""
            import json, resource
            resource.setrlimit(resource.RLIMIT_AS, ({1 << 30}, {1 << 30}))
            from dueproof_engine.api import storage
            from dueproof_engine.pipeline.pdf import ReadError
            try:
                {call}
                result = {{"result": "ok"}}
            except (ReadError, storage.StorageError) as e:
                result = {{"result": "refused", "error": type(e).__name__}}
            except BaseException as e:
                result = {{"result": "exception", "error": type(e).__name__}}
            print(json.dumps(result))
        """)
        p = subprocess.run([sys.executable, "-c", prog], cwd=ENGINE, capture_output=True, text=True, timeout=120)
        lines = [l for l in p.stdout.splitlines() if l.startswith("{")]
        return json.loads(lines[-1]) if lines else {"result": "process died", "rc": p.returncode}

    def test_a_nested_content_encoding_cannot_inflate_past_the_cap(self):
        got = self._child(f"storage.fetch({self.base + '/gzip-gzip'!r}, max_bytes=80 << 20)")
        self.assertEqual(got["result"], "refused", got)          # today: MemoryError under 1 GiB

    def test_the_put_response_body_is_not_read_into_memory(self):
        got = self._child(f"storage.put({self.base + '/img'!r}, b'x')")
        self.assertEqual(got["result"], "ok", got)              # today: MemoryError under 1 GiB

    def test_the_fetch_timeout_bounds_the_whole_request(self):
        t0 = time.monotonic()
        with mock.patch.object(config, "FETCH_TIMEOUT", 1.0):
            try:
                storage.fetch(self.base + "/drip")
            except (storage.StorageError, ReadError):
                pass
        self.assertLess(time.monotonic() - t0, 3.0, "a 1 s timeout let a slow sender hold the fetch for ~6 s")


class Addresses(unittest.TestCase):
    INTERNAL = ["http://127.0.0.1/", "http://localhost/", "http://[::1]/", "http://169.254.169.254/latest/meta-data/",
                "http://2130706433/", "http://0x7f000001/", "http://10.0.0.1/", "http://[::ffff:169.254.169.254]/"]

    def test_internal_addresses_are_refused_even_without_an_allowlist(self):
        with mock.patch.dict(os.environ, {"DUEPROOF_ALLOWED_HOSTS": ""}):
            for url in self.INTERNAL:
                with self.subTest(url=url), self.assertRaises(storage.StorageError):
                    storage.check_url(url)

    def test_an_allowed_name_that_resolves_to_loopback_is_refused(self):
        """DNS rebinding: the allowlist is checked on the name, the connection
        goes to whatever the name resolves to at connect time."""
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), Hostile)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        port = httpd.server_address[1]
        real = socket.getaddrinfo

        def rebinding(host, *a, **kw):
            if host == "bucket.r2.cloudflarestorage.com":
                host = "127.0.0.1"
            return real(host, *a, **kw)
        try:
            with mock.patch.dict(os.environ, {"DUEPROOF_ALLOWED_HOSTS": "*.r2.cloudflarestorage.com"}), \
                    mock.patch("socket.getaddrinfo", rebinding), self.assertRaises(storage.StorageError):
                storage.fetch(f"http://bucket.r2.cloudflarestorage.com:{port}/doc.pdf")
        finally:
            httpd.shutdown()
            httpd.server_close()

    def test_a_malformed_host_is_a_storage_error_not_a_500(self):
        from fastapi.testclient import TestClient
        from dueproof_engine.app import app
        c = TestClient(app, raise_server_exceptions=False, headers={"Authorization": f"Bearer {token()}"})
        for url in ("http://[::1/", "https://[bucket.example]/x"):
            with self.subTest(url=url):
                r = c.post("/v1/inspect", json={"sourceUrl": url, "mime": "application/pdf"})
                self.assertEqual(r.status_code, 502, r.text[:100])
                self.assertEqual(r.json().get("error"), "storage")
                r = c.post("/v1/read", json={"sourceUrl": "http://127.0.0.1:9/x.pdf", "mime": "application/pdf",
                                             "pageImagePutUrls": [url]})
                self.assertEqual(r.status_code, 502, r.text[:100])
                self.assertEqual(r.json().get("error"), "storage")


if __name__ == "__main__":
    unittest.main()
