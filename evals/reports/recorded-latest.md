# Dueproof AI eval (recorded)

Generated 2026-11-16T12:13:18.810Z. Cases: circular-NMR-SAF-2026-041, Scan-circular-photo, invoice-HVC-2026-1183, minutes-board-87, notice-gst-asmt10.

| Route | Precision | Recall | Deadline exact | Amount exact | Located | Confident-wrong | AI calls | Cost / notice | Mean latency | Gate |
|---|---|---|---|---|---|---|---|---|---|---|
| rules | 80 % | 44 % | 50 % | 100 % | — | 0 | 0 | $0.0000 | 0.0 s | pass |
| haiku | 69 % | 50 % | 56 % | 100 % | 85 % | 0 | 5 | $0.0002 | 1.8 s | pass |
| sonnet | 82 % | 78 % | 75 % | 100 % | 100 % | 0 | 5 | $0.0051 | 5.6 s | pass |
| opus | 88 % | 78 % | 75 % | 100 % | 100 % | 0 | 5 | $0.0098 | 10.5 s | pass |
| routed | 82 % | 78 % | 75 % | 100 % | 100 % | 0 | 4 | $0.0038 | 4.6 s | pass |
| routed_haiku | 74 % | 78 % | 75 % | 100 % | 100 % | 0 | 4 | $0.0031 | 3.6 s | pass |

Routes:

- **rules**: Rules only (no model): the baseline
- **haiku**: Haiku 5.5 on every notice, no escalation
- **sonnet**: Sonnet 5.5 on every notice, no escalation
- **opus**: Opus 5.5 on every notice, no escalation
- **routed**: The router as shipped: no model when rules are confident, Sonnet otherwise, escalation to Opus
- **routed_haiku**: The router with Haiku enabled for clean digital notices

## Per case

### rules

| Case | Tags | Found | Predicted (matched) | Deadlines exact | Located | Calls | Escalations | Confident-wrong |
|---|---|---|---|---|---|---|---|---|
| circular-NMR-SAF-2026-041 | digital, ml, en | 2/7 | 3 (2) | 2/6 | — | 0 | — | 0 |
| Scan-circular-photo | scan, en | 2/7 | 3 (2) | 2/6 | — | 0 | — | 0 |
| invoice-HVC-2026-1183 | digital, en | 1/1 | 1 (1) | 1/1 | — | 0 | — | 0 |
| minutes-board-87 | digital, en | 1/1 | 1 (1) | 1/1 | — | 0 | — | 0 |
| notice-gst-asmt10 | digital, en | 2/2 | 2 (2) | 2/2 | — | 0 | — | 0 |

### haiku

| Case | Tags | Found | Predicted (matched) | Deadlines exact | Located | Calls | Escalations | Confident-wrong |
|---|---|---|---|---|---|---|---|---|
| circular-NMR-SAF-2026-041 | digital, ml, en | 3/7 | 4 (3) | 3/6 | 3/3 | 1 | — | 0 |
| Scan-circular-photo | scan, en | 2/7 | 3 (2) | 2/6 | 0/2 | 1 | — | 0 |
| invoice-HVC-2026-1183 | digital, en | 1/1 | 2 (1) | 1/1 | 2/2 | 1 | — | 0 |
| minutes-board-87 | digital, en | 1/1 | 2 (1) | 1/1 | 2/2 | 1 | — | 0 |
| notice-gst-asmt10 | digital, en | 2/2 | 2 (2) | 2/2 | 4/4 | 1 | — | 0 |

### sonnet

| Case | Tags | Found | Predicted (matched) | Deadlines exact | Located | Calls | Escalations | Confident-wrong |
|---|---|---|---|---|---|---|---|---|
| circular-NMR-SAF-2026-041 | digital, ml, en | 7/7 | 9 (7) | 6/6 | 8/8 | 1 | — | 0 |
| Scan-circular-photo | scan, en | 3/7 | 4 (3) | 2/6 | 3/3 | 1 | — | 0 |
| invoice-HVC-2026-1183 | digital, en | 1/1 | 1 (1) | 1/1 | 2/2 | 1 | — | 0 |
| minutes-board-87 | digital, en | 1/1 | 1 (1) | 1/1 | 1/1 | 1 | — | 0 |
| notice-gst-asmt10 | digital, en | 2/2 | 2 (2) | 2/2 | 4/4 | 1 | — | 0 |

### opus

| Case | Tags | Found | Predicted (matched) | Deadlines exact | Located | Calls | Escalations | Confident-wrong |
|---|---|---|---|---|---|---|---|---|
| circular-NMR-SAF-2026-041 | digital, ml, en | 7/7 | 8 (7) | 6/6 | 7/7 | 1 | — | 0 |
| Scan-circular-photo | scan, en | 3/7 | 4 (3) | 2/6 | 3/3 | 1 | — | 0 |
| invoice-HVC-2026-1183 | digital, en | 1/1 | 1 (1) | 1/1 | 2/2 | 1 | — | 0 |
| minutes-board-87 | digital, en | 1/1 | 1 (1) | 1/1 | 1/1 | 1 | — | 0 |
| notice-gst-asmt10 | digital, en | 2/2 | 2 (2) | 2/2 | 4/4 | 1 | — | 0 |

### routed

| Case | Tags | Found | Predicted (matched) | Deadlines exact | Located | Calls | Escalations | Confident-wrong |
|---|---|---|---|---|---|---|---|---|
| circular-NMR-SAF-2026-041 | digital, ml, en | 7/7 | 9 (7) | 6/6 | 8/8 | 1 | — | 0 |
| Scan-circular-photo | scan, en | 3/7 | 4 (3) | 2/6 | 3/3 | 1 | — | 0 |
| invoice-HVC-2026-1183 | digital, en | 1/1 | 1 (1) | 1/1 | 2/2 | 1 | — | 0 |
| minutes-board-87 | digital, en | 1/1 | 1 (1) | 1/1 | 1/1 | 1 | — | 0 |
| notice-gst-asmt10 | digital, en | 2/2 | 2 (2) | 2/2 | — | 0 | — | 0 |

### routed_haiku

| Case | Tags | Found | Predicted (matched) | Deadlines exact | Located | Calls | Escalations | Confident-wrong |
|---|---|---|---|---|---|---|---|---|
| circular-NMR-SAF-2026-041 | digital, ml, en | 7/7 | 9 (7) | 6/6 | 8/8 | 1 | — | 0 |
| Scan-circular-photo | scan, en | 3/7 | 4 (3) | 2/6 | 3/3 | 1 | — | 0 |
| invoice-HVC-2026-1183 | digital, en | 1/1 | 2 (1) | 1/1 | 2/2 | 1 | — | 0 |
| minutes-board-87 | digital, en | 1/1 | 2 (1) | 1/1 | 2/2 | 1 | — | 0 |
| notice-gst-asmt10 | digital, en | 2/2 | 2 (2) | 2/2 | — | 0 | — | 0 |

## Notes

- Recorded mode: model answers are replayed from evals/recordings (currently hand-written stand-ins, source: synthetic). Token counts and cost are estimated from prompt sizes; latency is the recorded value. Re-record with --mode live --record.
- Quotes are located with the TypeScript linker (exact token match) plus a spacing-insensitive fallback graded `strong` (evals/lib/link.ts), standing in for the engine's fuzzy linker.
- Steady state: AI-only located findings are trusted without the first-N review, so confident-wrong is measured at its worst.
