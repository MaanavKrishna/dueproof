# Notice types

In v0.1 an organisation says which kinds of notice it handles in the setup
wizard (**Notice types**) or in **Settings → Profiles**. Owners and admins
can change it.

| Notice type | Covers |
|---|---|
| GST | ASMT-10, DRC-01, REG-17 and others; GSTR-1, 3B and 9 calendar |
| Income tax | 143(1), 142(1), 148A, 156; advance tax and ITR calendar |
| TDS | 200A intimations; TDS payments and returns |
| ROC / MCA | Adjudication notices; AOC-4 and MGT-7 |
| Courts and tribunals | Hearing notices and orders |

GST, Income tax and TDS are on for a new organisation.

## What the choice does in v0.1

The choice is saved and recorded in the audit trail. **It doesn't yet change
what Dueproof reads**:

- Every notice is read with the same rules, the engine's `notices_in` set
  for Indian notices (GST, income tax, TDS, MCA/ROC, EPFO/ESIC, RBI/SEBI and
  court notices), whatever is ticked.
- Statutory deadlines come from each **client's registrations** (see
  [Quickstart → Clients](quickstart.md#8-clients)), not from this setting.

## Where the rules live

- **Reading notices:** `services/engine/dueproof_engine/profiles/`. A
  profile is a Python file of plain word lists: notice types and the phrases
  that identify them, how a duty is worded, deadline markers, issuing
  offices, how references are introduced. `notices_in.py` is the one the app
  uses. The others (`general`, `hospital`, `municipality`, `metro_rail_ml`)
  come from the 0.0.x demo; the engine can load them, but the v0.1 app
  doesn't ask for them.
- **Statutory calendars:** `packages/core/src/statutory/packs/in/`
  (GST, income tax and TDS, ROC). Each rule is data with a source citation,
  and each is marked `verified: false` until a CA signs it off. The app shows
  "Rule not yet checked by a CA" beside every such deadline.

## Changing the rules safely

Vocabulary changes move findings. Measure before and after on your own
documents with the engine's evaluation tool: see
[Evaluation](evaluation.md). Contributions are welcome; see
`CONTRIBUTING.md`.
