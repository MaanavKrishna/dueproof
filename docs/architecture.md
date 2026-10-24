# Architecture

```
browser ──► dueproof.web (FastAPI) ──► SQLite (WAL) + page JPEGs in <data>
                  │ dueproof.ingest: two worker threads
   read ──► translate ──► analyze ──► link ──► duplicates
```

## Where things are

```
dueproof/
  cli.py            the `dueproof` command
  config.py         settings from the environment and the profile
  db.py             schema and connections
  ingest.py         the queue: workers, processing, duplicates, crash recovery
  records.py        shaping rows for the API; the deadline query; audit writes
  accounts.py       users, sessions, sign-in
  digest.py         the reminder email
  export.py         CSV and the printable evidence report
  languages.py      the 22 languages
  logs.py           logging and request ids
  pipeline/         reading a document (below)
  profiles/         vocabulary: desks, document types, phrasing
  tools/            operator commands: backup, doctor, evaluate, model
  web/
    app.py          the FastAPI app: middleware, security headers, routers
    common.py       helpers the routes share
    routes/         system, accounts, documents, findings
    static/         the browser app (plain HTML, CSS and JavaScript)
tests/              unittest suite, fixtures and the golden file
scripts/            serve.sh and test.sh for development
deploy/             systemd units and a Caddy example
website/            the project website (Next.js), not part of the product
```

| Module | Job |
|---|---|
| `pipeline/pdf.py` | PDFium (pypdfium2): open, render, and group characters into words, lines and blocks, honouring page rotation. PDFium is not thread-safe, so every call goes through one lock |
| `pipeline/read.py` | Text layer where a page has one, Tesseract where it does not; deskew before OCR and map every box back; images and multi-page TIFFs; reflow into sentences |
| `pipeline/scripts/` | Script-specific repair (Malayalam today) |
| `pipeline/translate.py` | IndicTrans2, offline: vendored code, hash-pinned weights, one translation at a time; the terminology check |
| `pipeline/analyze.py` | Sentences → obligations, deadlines, hearings, desks, notice fields, summary |
| `pipeline/link.py` | Quote → page and per-line rectangles; MinHash duplicate candidates |
| `ingest.py` | Worker threads, the processing of one document, de-duplication, recovery after a crash |
| `web/` | API, sign-in and CSRF checks, search (FTS5 trigram), workflow, audit |

## Decisions worth knowing

**Rules, not a model, decide.** Every finding can be traced to the words that
caused it. A translation model helps rules read other languages; it never
decides on its own, and the original wording is always the proof.

**Never a guessed rectangle.** Matching ignores spacing (renderers and OCR
disagree about word boundaries) and produces one box per line — per slice of a
line on a tilted scan, so a box never reaches into the neighbouring lines.
Below the match threshold there is no box at all.

**Nothing overwritten.** Corrections sit beside what was found; edit history
and the audit trail are append-only at the database level.

**Offline by construction.** No code path makes a network call; the
translation model's code is vendored, its weights hash-checked, and the
Hugging Face libraries are forced offline. The one exception, `dueproof
fetch-model`, is run by hand.

**One clock.** Timestamps are UTC; "today" and "overdue" are decided in the
profile's timezone on the server, and the browser uses the server's date.

**Small and auditable.** The app has no frontend framework or build step; SQLite; a short
dependency list. What an operator has to review is what they deploy.
