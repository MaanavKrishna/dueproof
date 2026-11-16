# Evaluation

Dueproof's rules are predictable, which also means they miss things your
notices word differently. Measure them on your own documents before you
rely on them, and again after changing the rules.

The tool is part of the engine (`services/engine`) and runs on the engine's
rules alone: no database, no AI. Its due dates are the engine's own reading
of each deadline, which the app keeps only as a cross-check; in the app,
dates are worked out by `packages/core` from the same rules, with your
holidays and working days.

## Labels

One JSON object per line, one per document:

```json
{"file": "notice.pdf", "received_on": "2026-10-24",
 "obligations": [{"quote": "directed to explain the discrepancies",
                  "due_date": "2026-11-23"}],
 "not_obligations": ["Failure to reply will attract"]}
```

A quote is any distinctive part of the sentence; spacing, case and
punctuation don't matter. `due_date` is optional. `received_on` is the day
the notice arrived, so "within 30 days of receipt" can be checked.

The v0.1 app doesn't export labels yet. Write them by hand from notices you
have checked; the corrections people make in the app (a due date corrected,
a finding dismissed) show what to write.

## Running it

```bash
cd services/engine
uv sync
uv run python scripts/fetch_ocr_models.py    # for scans; text-layer PDFs don't need it
uv run python -m dueproof_engine.tools.evaluate labels.jsonl --docs folder-with-the-pdfs
```

| Metric | Meaning |
|---|---|
| `precision` | Of the obligations found, how many are real |
| `recall` | Of the real obligations, how many were found |
| `deadline_exact` | Labelled due dates reproduced exactly. Off by one day counts as wrong |
| `false_confident` | Findings graded exact or strong whose outline doesn't cover the quote. **This must be zero**: a confident box in the wrong place is the one failure Dueproof exists to prevent |
| `labelled_non_obligations_flagged` | Sentences you said aren't duties, that were flagged anyway |

It also prints `desk_top1` and `desk_top3`, left from the 0.0.x demo's
desks. v0.1 has no desks, so ignore them.

Add `--json` for machine-readable output. Add floors to make it a gate, for
CI or before upgrading:

```bash
uv run python -m dueproof_engine.tools.evaluate labels.jsonl --docs docs/ \
    --min-precision 0.9 --min-recall 0.8 --min-deadline 1.0 --max-false-confident 0
```

It exits with an error when a floor isn't met.

The engine's own small fictional corpus is in `services/engine/tests/fixtures`
(with `labels.jsonl`). It describes a handful of documents written by the
authors; your documents are the only honest measure.
