"""Test suite. Importing this package selects the bilingual example profile
(it exercises everything the general one does, plus a second language),
switches translation off and sets a shared secret for the HTTP tests. The
engine writes nothing to disk, so there is no data folder to redirect."""
import os

os.environ["DUEPROOF_PROFILE"] = "metro_rail_ml"
os.environ.pop("DUEPROOF_LANGUAGES", None)
os.environ.setdefault("DUEPROOF_TRANSLATE", "0")
os.environ["ENGINE_SHARED_SECRET"] = "test-secret-" + "s" * 32
os.environ.pop("ENGINE_AUTH", None)
# The local stand-in for signed-URL storage (tests/storage_server.py) listens here.
os.environ["DUEPROOF_ALLOWED_HOSTS"] = "127.0.0.1,localhost"
os.environ.pop("DUEPROOF_ALLOW_ANY_HOST", None)
os.environ.setdefault("DUEPROOF_LOG_LEVEL", "CRITICAL")
# No wall-clock limit on Tesseract here: on a busy shared runner a page can
# take minutes, and a timed-out page reads as empty. tests/test_ocr_timeout.py
# checks the limit itself.
os.environ.setdefault("DUEPROOF_TESSERACT_TIMEOUT", "0")
