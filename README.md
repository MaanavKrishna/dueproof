# Dueproof

Document intelligence you can check. Drop in a PDF and get a summary, the
obligations it creates, their deadlines and the desk each belongs to — and for
every one of those, a click opens the page with the exact lines outlined.

It runs entirely on your own machine. No API keys, no cloud calls, no language
model: extraction is rule-based and explainable, OCR is Tesseract, and optional
translation uses a local model whose code is vendored and whose weights are
hash-pinned.

## What it does

- **Reads any PDF** — a text layer where there is one, OCR where there is not,
  including skewed phone photos of printouts.
- **Finds duties and deadlines** — a sentence is an obligation because it
  directs someone; a date is a deadline only when the sentence frames it as one.
- **Routes** each finding to the desks it concerns, by a vocabulary you control.
- **Proves it** — every finding carries a verbatim quote, located on the page as
  one rectangle per line. When a quote cannot be located, there is no box at
  all rather than a guessed one.
- **Spots the same document arriving twice**, even as a scan of the original.
- **Searches every page**, with hits outlined on the page like findings.
- **Exports** the deadline list as a CSV and as an evidence PDF, each
  obligation above the cropped passage it came from.
- **Reads 22 Indian languages beside English** — Hindi, Bengali, Tamil, Telugu,
  Marathi, Urdu and the rest of the scheduled languages, mixed freely within a
  document. Each sentence is translated locally so the same rules read it, and
  the proof is always the original wording on the page.

## Quick start

```bash
python3 -m venv .venv
```

```bash
.venv/bin/pip install -r requirements.txt
```

```bash
./run.sh
```

Then open <http://127.0.0.1:8000> and drop a PDF on it.

You need Python 3.12+ and [Tesseract](https://tesseract-ocr.github.io/) on your
`PATH` (`brew install tesseract`, `apt install tesseract-ocr`).

To load a folder of PDFs from the command line:

```bash
.venv/bin/python scripts/ingest.py /path/to/pdfs
```

## Profiles: making it yours

Everything Dueproof looks for lives in one file per organisation, in
`profiles/`. A profile is plain Python lists — no code:

| Setting | What it is |
|---|---|
| `ROLES`, `ROLE_KEYWORDS`, `DEFAULT_ROLE` | Your desks, and the words that route a finding to each |
| `DOC_TYPE_KEYWORDS` | Document types and the phrases that identify them |
| `OBLIGATION_CUES`, `SEVERITY_HIGH` | How a duty and its urgency are worded |
| `DEADLINE_MARKERS` | The phrases that make a date a deadline |
| `CHANNELS`, `ORG_NAME`, `TIMEZONE` | Where documents come from, who you are, where "today" is decided |
| `LANGUAGES` | Which languages to read beside English |
| `LOCAL_MONTHS`, `TERMS`, … | Optional own-language vocabulary, and the terms a translation is checked against |

Four ship with the project:

- **`general`** (default) — any organisation with the usual desks: operations,
  finance, legal, HR, procurement, IT, facilities. Copy it to start your own —
  a hospital, a municipality, a bank, a university, a law firm.
- **`hospital`**, **`municipality`** — short examples of other domains; the
  second switches on Hindi with no Hindi vocabulary of its own.
- **`metro_rail_ml`** — a deeper example: a rail operator, with own-language
  vocabulary for Malayalam.

```bash
DUEPROOF_PROFILE=metro_rail_ml ./run.sh
```

After editing a profile, run `./test.sh`.

## Languages

English is always read. Switch on any of the 22 languages [IndicTrans2]
translates — Assamese, Bengali, Bodo, Dogri, Gujarati, Hindi, Kannada,
Kashmiri, Konkani, Maithili, Malayalam, Manipuri, Marathi, Nepali, Odia,
Punjabi, Sanskrit, Santali, Sindhi, Tamil, Telugu, Urdu:

```bash
DUEPROOF_LANGUAGES=hi,ta,bn ./run.sh
```

`all` enables every one. Codes are in `languages.py`.

**How a language works without any setup.** Each non-English sentence is
translated to English on your machine *before* analysis, and the rules read the
original and its translation together. So a Tamil circular yields dated,
routed obligations with no Tamil vocabulary written by anyone — while the quote
that gets outlined on the page, and the text a reader can check, is the Tamil.
Translations are labelled, and one that appears to have lost a term or a number
is flagged.

What each language needs on the machine:

- **Translation weights** (one model covers all 22) — see *Translation* below.
  Without them a language is still read, searched and displayed, but only a
  profile's own-language vocabulary finds its obligations.
- **For scans, its Tesseract pack** (`apt install tesseract-ocr-hin`, or
  `brew install tesseract-lang`). Only installed packs are used. Tesseract has
  no pack for Bodo, Dogri, Kashmiri, Konkani, Maithili, Manipuri or Santali;
  those are read from PDFs with a text layer, not from scans.
- **For the exported PDF, its font** — drop the Noto font named in
  `languages.py` into `static/fonts/`. Malayalam is bundled. Without the font
  the report shows the English and the page image, which carries the original.

Languages that share a script (Hindi, Marathi, Nepali and others are all
Devanagari) are told apart by configuration, not detection: among the languages
you enable, the first listed claims its script.

Tested end to end with the real model: Hindi, Tamil, Bengali, Urdu, Telugu and
Malayalam. The others use the same path and are not yet individually tested.

A profile can add depth for a language it cares about — month names, how
duties are phrased, terminology to check translations against — which makes
extraction work without the model and exact where a translation is not.
`metro_rail_ml` does this for Malayalam. If extraction damages a script
(doubled marks, words split across lines), add a repair module to
`pipeline/scripts/`; `malayalam.py` is the model.

[IndicTrans2]: https://github.com/AI4Bharat/IndicTrans2

## Configuration

| Variable | Default | |
|---|---|---|
| `DUEPROOF_PROFILE` | `general` | Which file in `profiles/` to use |
| `DUEPROOF_LANGUAGES` | from profile | Languages to read beside English: `hi,ta`, or `all` |
| `DUEPROOF_ORG` | from profile | Organisation name shown in the interface |
| `DUEPROOF_TZ` | from profile | Timezone for "today" and "overdue" |
| `DUEPROOF_DATA` | `./data` | Database, uploads, page images |
| `DUEPROOF_HOST` / `DUEPROOF_PORT` | `127.0.0.1` / `8000` | Where `run.sh` listens |
| `DUEPROOF_TESSERACT` | found on `PATH` | Path to the Tesseract binary |
| `DUEPROOF_TRANSLATE` | `1` | `0` skips translation |
| `DUEPROOF_MT_DIR` | `./models/indictrans2` | Translation weights |
| `DUEPROOF_AUTH_HEADER` | unset | Header your SSO proxy sets; see below |
| `DUEPROOF_LOG_LEVEL` | `INFO` | |

### Running behind single sign-on

Dueproof does not log anyone in. Put it behind a reverse proxy that does
(oauth2-proxy, or your SSO gateway), and name the header the proxy sets:

```bash
DUEPROOF_AUTH_HEADER=X-Forwarded-User ./run.sh
```

Every API call must then carry that header, and its value is who the audit
trail records. The proxy must strip the header from incoming requests so a
client cannot set it, and Dueproof's port must be reachable only from the
proxy.

## How it works

```
browser  ─►  app.py (FastAPI + two workers)  ─►  SQLite + page JPEGs
                  │
        read → translate → analyze → link
```

| File | What it does |
|---|---|
| `pipeline/read.py` | Renders pages; word boxes from the text layer or Tesseract; deskews scans and maps every box back; reflows words into sentences. |
| `pipeline/scripts/` | Script-specific repair, selected by the profile. |
| `pipeline/analyze.py` | Title, type, summary bullets, obligations, deadlines, routing. Rules, read against the profile. |
| `pipeline/translate.py` | Non-English sentences to English, and a check that flags terms and numbers a translation may have lost. |
| `languages.py` | The 22 languages: script, OCR pack, translation tag, font. |
| `pipeline/link.py` | Quote → page and per-line rectangles; duplicate scoring and its MinHash candidate index. |
| `app.py` | API, worker pool, ingest de-duplication, search, audit trail, restart recovery. |
| `export.py` | CSV and evidence PDF. |
| `profiles/` | Vocabulary. |
| `scripts/` | `ingest.py`, `backup.py`, `fetch_model.py`. |

### Why the code does what it does

**Citation linking.** Matching ignores spaces: renderers break words across
lines and OCR invents gaps, so word boundaries are the least trustworthy part
of the signal. Output is one rectangle per line, never a union box, which would
swallow the margin and any neighbouring column.

**Confidence is honest.** `exact`, `strong`, `approximate`, or `none` — and
`none` shows no rectangle. A wrong box labelled confident is the one failure
this design exists to prevent.

**OCR geometry.** Pages are deskewed before OCR, and every word box is pushed
back through the inverse transform, so highlights land on the original image.

**Deadlines vs. dates.** Issue dates and reporting periods carry dates too.
Only a date beside a deadline marker becomes one.

**Duplicates.** Each document gets a MinHash signature. Candidates come from
an indexed count of shared signature keys; only those are scored by the fuzzy
matcher, which decides.

**One clock.** Timestamps are stored in UTC; "overdue" is decided in the
organisation's timezone, on the server, and the browser uses that date.

## Translation

Translation is off until a language is enabled. It is offline by construction:

- The model's code is vendored in `pipeline/indictrans2/`, byte-identical to a
  pinned upstream revision. There is no `trust_remote_code`.
- Every weight file is checked against a SHA-256 in `config.py` before loading.
- The Hugging Face libraries are set offline: a missing file is an error,
  never a download.

Provision the weights once, on a connected machine: accept the licence on the
[model page](https://huggingface.co/ai4bharat/indictrans2-indic-en-dist-200M),
run `hf auth login`, then

```bash
.venv/bin/python scripts/fetch_model.py
```

It downloads data files only, never Python, into `models/indictrans2/` and
verifies them. Without weights everything else works; findings stay in the
language they were written in and are labelled as such.

## API

| Method | Endpoint | Returns |
|---|---|---|
| `POST` | `/api/upload` | `{ doc_id, duplicate }`; identical bytes return the document on file |
| `GET` | `/api/status/{doc_id}` | `{ stage, percent, done }` |
| `GET` | `/api/documents?role=&channel=&limit=&offset=` | A page of the queue; `X-Total-Count` has the full size |
| `GET` | `/api/document/{doc_id}` | Card: bullets, obligations, duplicates |
| `GET` | `/api/deadlines?role=&days=&limit=&offset=` | Every dated obligation |
| `GET` | `/api/search?q=` | Matching pages and translated findings, with rectangles |
| `GET` | `/api/export/deadlines.csv` `.pdf` | Spreadsheet or evidence report |
| `GET` | `/api/page/{doc_id}/{n}.jpg` | Page image |
| `POST` | `/api/inbox/scan` | Ingest new PDFs in `data/inbox/` |
| `GET` | `/api/audit?doc_id=&action=` | Audit trail |
| `GET` | `/api/meta` · `/health` | Profile settings · liveness and queue depth |

## Operations

- **Backups.** `scripts/backup.py backup <dir>` takes a consistent snapshot
  while the app runs; `verify` checks database integrity, every original
  against its recorded hash, and every page image; `restore` verifies first.
- **Restart-safe.** Documents caught mid-process are re-queued at start-up.
- **Bounded.** 80 MB per upload, 300 pages per PDF, 40 MP per rendered page;
  non-PDF content is refused by its header.
- **Audited.** Uploads, views, proof-panel opens, searches and exports go to
  an append-only table.
- **Container.** A `Dockerfile` is included. It has not been built or run yet;
  treat it as a starting point.

## Tests

```bash
.venv/bin/pip install -r requirements-dev.txt
```

```bash
./test.sh
```

About 200 tests, stdlib `unittest`. The test corpus is generated on the fly —
fictional documents, no binary fixtures — and findings for it are pinned in
`tests/golden.json`; after a deliberate change, run `python -m tests.make_golden`
and read the diff. The suite needs Tesseract's Malayalam pack (it exercises a
bilingual profile); tests that use the translation model are skipped when the
weights are absent.

## What it does not do

Be clear-eyed before deploying this anywhere that matters.

- **No login of its own, no per-document access control, no TLS.** It binds to
  localhost. Put it behind your SSO proxy (see *Running behind single sign-on*)
  before exposing it; everyone who gets in sees every document.
- **Extraction quality is not measured.** The rules are predictable and
  auditable, and they will miss a duty phrased in a way the profile does not
  cover. There is no labelled evaluation set; build one from your own documents
  before trusting recall.
- **No handwriting.** Open-source OCR does not read it.
- **Machine translation is machine translation.** It is labelled, the original
  is one click away, and suspicious output is flagged — never silently fixed.
- **One node.** SQLite, two workers, no failover.
- **No correction workflow.** A wrong finding cannot yet be edited.
- **Uploads are not scanned for malware.**

## Roadmap and contributing

`ROADMAP.md` says what comes next and what will never be built.
`CONTRIBUTING.md` says how to add a profile, a language, or a fix.
Security reports: `SECURITY.md`.

## Licence

Apache License 2.0 — see `LICENSE` and `NOTICE`.

One dependency deserves attention before you host or sell this:
**PyMuPDF is licensed AGPL-3.0** (or commercially, from Artifex). Dueproof's
own code is Apache-2.0, but running it as a network service with PyMuPDF
inside brings AGPL obligations for the combined work unless you hold a
commercial PyMuPDF licence. Replacing it is the first item on the roadmap.
