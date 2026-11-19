"""Fuzz findings at the HTTP layer (app.py, api/service.py).

1. The body cap (DUEPROOF_MAX_BODY_BYTES) reads only the Content-Length
   header. A chunked request has none, so it is read and parsed whatever its
   size (measured on uvicorn: 39 MB accepted with the cap at 1 MB). Expected:
   413 once the streamed body passes the cap.
(The tall-page WebP finding is handled with the image limits, elsewhere.)
"""
import os
import unittest

from fastapi.testclient import TestClient

from dueproof_engine.app import app
from tests.support import token


def _client() -> TestClient:
    return TestClient(app, raise_server_exceptions=False, headers={"Authorization": f"Bearer {token()}"})


class BodyCap(unittest.TestCase):
    def test_a_chunked_body_over_the_cap_is_refused(self):
        import dueproof_engine.app as appmod
        quote = b'{"id":"q","text":"' + b"q" * 1000 + b'"},'
        cap = appmod.MAX_BODY_BYTES

        def body():                                    # no Content-Length: sent chunked
            yield b'{"pages":[],"quotes":['
            sent = 0
            while sent <= cap + (1 << 20):
                yield quote * 100
                sent += len(quote) * 100
            yield b'{"id":"last","text":"x"}]}'
        r = _client().post("/v1/link", content=body(), headers={"Content-Type": "application/json"})
        self.assertEqual(r.status_code, 413, f"a {cap >> 20} MB cap let a larger chunked body through")


if __name__ == "__main__":
    unittest.main()
