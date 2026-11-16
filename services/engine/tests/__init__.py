"""Test suite. Importing this package redirects every write to a temp directory,
selects the bilingual example profile (it exercises everything the general one
does, plus a second language) and switches translation off, so a test run can
never touch data/."""
import atexit
import os
import shutil
import tempfile

_TMP = tempfile.mkdtemp(prefix="dueproof-test-")
os.environ["DUEPROOF_DATA"] = _TMP
os.environ["DUEPROOF_PROFILE"] = "metro_rail_ml"
os.environ.pop("DUEPROOF_TZ", None)
os.environ.pop("DUEPROOF_ORG", None)
os.environ.setdefault("DUEPROOF_TRANSLATE", "0")
os.environ["DUEPROOF_AUTH"] = "none"         # sign-in has its own tests, tests/test_accounts.py
os.environ.setdefault("DUEPROOF_LOG_LEVEL", "CRITICAL")
atexit.register(shutil.rmtree, _TMP, ignore_errors=True)
