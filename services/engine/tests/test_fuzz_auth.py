"""Fuzz findings on the bearer token (api/auth.py).

What held: alg none / None / RS256 / HS512 refused; wrong or missing aud,
missing, string or boolean exp, expired, and over-long lifetimes refused;
error messages never echo the token.

What did not:
1. exp = NaN (Python's json accepts it) passes both expiry comparisons, so
   such a token never expires. Only a holder of the secret can mint one, but
   a leaked NaN token is valid for ever.
2. A non-ASCII character in the payload part (header values arrive as
   latin-1) raises UnicodeEncodeError at hmac input, outside the try: an
   unauthenticated request gets a 500, not a 401.
3. The signature's base64 is decoded leniently: characters outside the
   alphabet are skipped and padding is ignored, so one token has many
   accepted spellings. Harmless today; it defeats any future replay cache
   keyed on the token string.
"""
import base64
import hashlib
import hmac
import os
import time
import unittest

from dueproof_engine.api import auth

SECRET = os.environ["ENGINE_SHARED_SECRET"].encode()


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _sign(head_b64: str, body_b64: str) -> str:
    return _b64(hmac.new(SECRET, f"{head_b64}.{body_b64}".encode("latin-1"), hashlib.sha256).digest())


class Tokens(unittest.TestCase):
    def test_a_nan_expiry_is_refused(self):
        head = _b64(b'{"alg":"HS256","typ":"JWT"}')
        body = _b64(b'{"aud":"engine","exp":NaN}')
        with self.assertRaises(auth.AuthError):
            auth.verify_token(f"{head}.{body}.{_sign(head, body)}", SECRET, now=time.time() + 10 * 365 * 86400)

    def test_a_non_ascii_token_is_a_401_not_a_500(self):
        head, body, sig = auth.make_token(SECRET, 60).split(".")
        with self.assertRaises(auth.AuthError):
            auth.verify_token(f"{head}.{body}é.{sig}", SECRET)

    def test_the_signature_has_one_spelling(self):
        head, body, sig = auth.make_token(SECRET, 60).split(".")
        for variant in (f"{sig[:5]}!*{sig[5:]}", f"{sig}==", f"{sig[:10]} {sig[10:]}"):
            with self.subTest(variant=variant), self.assertRaises(auth.AuthError):
                auth.verify_token(f"{head}.{body}.{variant}", SECRET)


if __name__ == "__main__":
    unittest.main()
