"""The active profile: every word Dueproof looks for.

A profile is a plain Python module in this package. Nothing in it is code — the
pipeline reads its lists, and its behaviour changes with them. Choose one with
DUEPROOF_PROFILE (default: "general"); write your own by copying general.py.

    from dueproof.profiles import ROLES, OBLIGATION_CUES, LANGUAGES

After editing a profile, run ./test.sh.
"""
from __future__ import annotations

import importlib
import os
import re

NAME = os.environ.get("DUEPROOF_PROFILE", "general")
if not re.fullmatch(r"[a-z][a-z0-9_]*", NAME):
    raise SystemExit(f"DUEPROOF_PROFILE={NAME!r} is not a profile name")
try:
    _module = importlib.import_module(f"dueproof.profiles.{NAME}")
except ModuleNotFoundError as exc:
    raise SystemExit(f"No profile named {NAME!r} in profiles/") from exc

# What a profile may leave out.
_DEFAULTS = {
    "ORG_NAME": "",                 # shown under the product name
    "TIMEZONE": "UTC",              # where "today" and "overdue" are decided
    "CHANNELS": ["Email", "Shared drive", "Chat", "Scan", "Upload"],
    "DEFAULT_DOC_TYPE": "Document",
    "SEVERITY_HIGH": [],
    "INFO_TERMS": [],               # words that make a sentence worth a summary bullet
    "DEADLINE_MARKERS": [],         # regex fragments: a date is a deadline only beside one
    "MODAL_MARKERS": ["shall", "must"],
    "SUBJECT_WORDS": ["subject", "sub", "re"],
    "TITLE_STOPS": ["To", "Ref", "Copy to"],
    "LANGUAGES": [],                # codes from dueproof.languages.py to read beside English
    # Optional own-language vocabulary. Without it a language still works:
    # its sentences are translated first and judged on their English.
    "LOCAL_MONTHS": {},             # month name -> number
    "LOCAL_RELATIVE": None,         # regex with one group: "within N days"
    "TERMS": {},                    # local term -> accepted English, for the translation check
    "LATIN_TERMS": [],
}
_REQUIRED = ("ROLES", "ROLE_KEYWORDS", "DEFAULT_ROLE", "DOC_TYPE_KEYWORDS", "OBLIGATION_CUES")

for _key in _REQUIRED:
    if not hasattr(_module, _key):
        raise SystemExit(f"profiles/{NAME}.py must define {_key}")
globals().update(_DEFAULTS)
globals().update({k: v for k, v in vars(_module).items() if k.isupper()})

if globals()["DEFAULT_ROLE"] not in globals()["ROLES"]:
    raise SystemExit(f"profiles/{NAME}.py: DEFAULT_ROLE is not one of ROLES")
if _unknown := set(globals()["ROLE_KEYWORDS"]) - set(globals()["ROLES"]):
    raise SystemExit(f"profiles/{NAME}.py: ROLE_KEYWORDS names unknown roles {sorted(_unknown)}")

def __getattr__(name: str):         # a clear error instead of an ImportError deep in the pipeline
    raise AttributeError(f"profile {NAME!r} has no setting {name!r}")
