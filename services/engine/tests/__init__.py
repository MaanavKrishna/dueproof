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
os.environ.pop("DUEPROOF_ALLOWED_HOSTS", None)
os.environ.setdefault("DUEPROOF_LOG_LEVEL", "CRITICAL")
