# Evaluation

Dueproof is rule-based, which makes it predictable — and makes it miss things
your documents phrase differently. Measure it on your own documents before you
rely on it.

## Labels

One JSON object per line, one per document:

```json
{"file": "notice.pdf", "received_on": "2026-10-24",
 "obligations": [{"quote": "directed to explain the discrepancies",
                  "due_date": "2026-11-23", "desks": ["GST & Indirect Tax"]}],
 "not_obligations": ["Failure to reply will attract"]}
```

A quote is any distinctive part of the sentence; spacing, case and punctuation
do not matter. `due_date` and `desks` are optional per obligation.

The cheapest way to get labels is to use Dueproof and correct it. Every
correction — a due date fixed, a desk changed, a finding marked *Not a duty* —
is a label:

```bash
dueproof labels export labels.jsonl        # documents someone has reviewed
dueproof labels export all.jsonl --all     # every document
```

## Running it

```bash
dueproof eval labels.jsonl --docs folder-with-the-pdfs
```

| Metric | Meaning |
|---|---|
| `precision` | of the obligations Dueproof found, how many are real |
| `recall` | of the real obligations, how many Dueproof found |
| `deadline_exact` | labelled due dates reproduced exactly — off by one day counts as wrong |
| `desk_top1`, `desk_top3` | the right desk first, or anywhere in the top three |
| `false_confident` | findings marked exact or strong whose outline does not cover the quote. This must be zero: a confident box in the wrong place is the one failure Dueproof exists to prevent. |
| `labelled_non_obligations_flagged` | sentences you said are not duties, that Dueproof flagged anyway |

Add floors to make it a gate, for CI or before upgrading:

```bash
dueproof eval labels.jsonl --docs docs/ --min-precision 0.9 --min-recall 0.8 \
    --min-deadline 1.0 --max-false-confident 0
```

The project's own CI runs this on the fictional fixture corpus in
`tests/fixtures/` — currently precision 1.0, recall 0.78, deadlines 1.0,
false-confident 0. Those numbers describe five documents written by the
authors; your documents are the only honest measure.
