# Architecture

```
browser ──► dueproof.app (FastAPI) ──► SQLite (WAL) + page JPEGs in <data>
                 │ two worker threads
   read ──► translate ──► analyze ──► link ──► duplicates
```

| Module | Job |
|---|---|
| `pipeline/pdf.py` | PDFium (pypdfium2): open, render, and group characters into words, lines and blocks, honouring page rotation |
| `pipeline/read.py` | Text layer where a page has one, Tesseract where it does not; deskew before OCR and map every box back; images and multi-page TIFFs; reflow into sentences |
| `pipeline/scripts/` | Script-specific repair (Malayalam today) |
| `pipeline/translate.py` | IndicTrans2, offline: vendored code, hash-pinned weights, one translation at a time; the terminology check |
| `pipeline/analyze.py` | Sentences → obligations, deadlines, hearings, desks, notice fields, summary |
| `pipeline/link.py` | Quote → page and per-line rectangles; MinHash duplicate candidates |
| `app.py` | API, sign-in and CSRF checks, worker pool, de-duplication, search (FTS5 trigram), workflow, audit |
| `auth.py`, `digest.py`, `evaluate.py`, `backup.py`, `doctor.py`, `cli.py` | The rest |
| `profiles/`, `languages.py` | Vocabulary and languages |

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

**Small and auditable.** No frontend framework or build step; SQLite; a short
dependency list. What an operator has to review is what they deploy.
