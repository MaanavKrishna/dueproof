# Profiles

Everything Dueproof looks for lives in a profile: a Python file of plain lists
in `dueproof/profiles/`. Choose one with `DUEPROOF_PROFILE`.

| Profile | For |
|---|---|
| `notices_in` (default) | Indian businesses and the CA/CS firms serving them: GST, income tax, TDS, MCA/ROC, EPFO/ESIC, RBI/SEBI and court notices. Eight desks. Hindi on. |
| `general` | Any organisation: operations, safety, finance, procurement, HR, legal, IT, facilities. English only unless you add languages. |
| `hospital` | A hospital or health system. |
| `municipality` | A city or district administration; Hindi on. |
| `metro_rail_ml` | A rail operator with Malayalam vocabulary — the example of going deep on one language. |

## Writing your own

Copy `general.py` to `dueproof/profiles/myorg.py`, edit, and run with
`DUEPROOF_PROFILE=myorg`. Matching is lowercase substring, so a stem
("procure", "penalt") covers its inflections.

| Setting | Required | What it is |
|---|---|---|
| `ROLES` | yes | Your desks |
| `ROLE_KEYWORDS` | yes | desk → words that route a finding there |
| `DEFAULT_ROLE` | yes | where a finding goes when nothing routes it |
| `DOC_TYPE_KEYWORDS` | yes | document type → phrases that identify it |
| `OBLIGATION_CUES` | yes | how a duty is worded; start from `english.OBLIGATION_CUES` |
| `DOC_TYPE_ROLES` | | document type → the desk every finding in it goes to |
| `SEVERITY_HIGH` | | words that make a duty urgent |
| `DEADLINE_MARKERS` | | regex fragments that make a date a deadline |
| `RECEIPT_MARKERS`, `HEARING_MARKERS` | | regex fragments; defaults cover English |
| `AUTHORITIES`, `REFERENCE_LABELS` | | issuing offices; how references are introduced |
| `CHANNELS`, `ORG_NAME`, `TIMEZONE` | | where documents come from; your name; where "today" is decided |
| `LANGUAGES` | | codes to read beside English, see [Languages](languages.md) |
| `LOCAL_MONTHS`, `LOCAL_RELATIVE`, `TERMS`, `LATIN_TERMS` | | optional own-language depth |

A profile is checked when Dueproof starts: a missing required list, a
`DEFAULT_ROLE` that is not a desk, or keywords for an unknown desk stop it with
a plain message.

## Changing a profile safely

Vocabulary changes move findings. Before and after an edit:

```bash
dueproof eval my-labels.jsonl --docs my-documents/
```

See [Evaluation](evaluation.md). Contributions of profiles for other kinds of
organisation are welcome — see `CONTRIBUTING.md`.
