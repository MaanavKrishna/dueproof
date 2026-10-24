"""The active profile: every word Dueproof looks for.

A profile is a plain Python module in this package. Nothing in it is code — the
pipeline reads its lists, and its behaviour changes with them. Choose one with
DUEPROOF_PROFILE (default: "notices_in"); write your own by copying general.py.

    from dueproof.profiles import ROLES, OBLIGATION_CUES, LANGUAGES

After editing a profile, run scripts/test.sh.
"""
from __future__ import annotations

import importlib
import os
import re

NAME = os.environ.get("DUEPROOF_PROFILE", "notices_in")
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
    # Notices: what makes a relative deadline run from the day the document was
    # *received* rather than issued, what marks a hearing, who issued it, and
    # how its reference number is introduced. English defaults; extend them.
    "RECEIPT_MARKERS": [r"of (?:the )?receipt", r"from (?:the date of )?receipt", r"on receipt",
                        r"of service of", r"from the date of service"],
    "HEARING_MARKERS": [r"personal hearing", r"hearing (?:is|has been|will be) (?:fixed|scheduled|held)",
                        r"date of hearing", r"appear (?:in person )?before", r"next date of hearing"],
    "AUTHORITIES": [],
    "DOC_TYPE_ROLES": {},           # document type -> the desk every finding in it goes to              # issuing offices to recognise, longest first is not required
    "REFERENCE_LABELS": [r"reference\s*(?:no\.?|number)", r"ref\.?\s*(?:no\.?)?", r"notice\s*(?:no\.?|number)",
                         r"order\s*(?:no\.?|number)", r"letter\s*(?:no\.?|number)", r"DIN", r"ARN",
                         r"case\s*(?:no\.?|number)", r"file\s*(?:no\.?|number)", r"invoice\s*(?:no\.?|number)"],
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
