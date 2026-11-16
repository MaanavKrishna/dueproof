# Notices

What Dueproof v0.1 reads from a notice, and the rules behind each item.
The rules are in `services/engine` (the `notices_in` profile). They are
plain word lists and patterns, so every finding can be traced to the words
that caused it. AI, when an organisation turns it on, only adds to them
(see [Workflow](workflow-and-reminders.md#reading-a-notice)).

## About the notice

| Field | How it is found |
|---|---|
| **Type** | Phrases that identify each notice type, weighted by where they appear: the masthead and the file name count more than the body |
| **Reference** | A label such as "Reference No", "DIN", "Notice No" or "ARN", followed by an identifier, near the top of page one |
| **Issued by** | A known issuing office anywhere in the text; failing that, an "Office of the …" heading or a top line naming an office |
| **Issued on** | The date labelled as such ("Date:", "Dated"), else the first date in the opening text |
| **Sections** | Provisions cited: "Section 61", "u/s 148A(b)", "Rule 86A", "Article 226", normalised |
| **Amount demanded** | The largest ₹ / Rs. / INR amount in a line about paying (demand, payable, tax, penalty, interest, outstanding…). Lakh and crore are converted |
| **Received** | The day it was uploaded, unless someone corrects it |

## Findings

Each finding has a verbatim **quote** from the page. The kinds:

| Kind | What it is |
|---|---|
| Obligation | A sentence that directs someone: "you are hereby directed to", "shall", "must", "furnish", "pay the", "appear before" |
| Deadline | An obligation with a deadline marker ("on or before", "within", "not later than", "due date"…) |
| Hearing | "A personal hearing is fixed on 18 November 2026": a date even without a deadline marker |
| Amount | The amount demanded |
| Reference, Office, Section | The facts above, each proved on the page |
| Summary | A few lines saying what the notice is about |

A bare date is never enough: issue dates and tax periods carry dates too.

## Dates are rules, not guesses

The engine never produces a due date. It produces a **date rule**, and
Dueproof's date engine (`packages/core`) works out the date:

| The notice says | The rule | Counted from |
|---|---|---|
| "on or before 21 August 2026" | fixed date | |
| "within 30 days of receipt of this notice" | 30 days | the **received** date |
| "within 15 days" (no mention of receipt) | 15 days | the date of issue |
| "within 7 working days" | 7 working days | as above, skipping the organisation's non-working days and holidays |
| "within 3 months from the date of service" | 3 months | the date of service |
| "within 30 days from the date of this order" | 30 days | the date of the order |

Every deadline shows its **basis** in plain words, such as "30 days from
receipt on 16 Nov 2026". A notice can't know when it reached you, so
Dueproof never counts "from receipt" from the issue date. Correct the
received date and every open deadline counted from it moves (see
[Quickstart](quickstart.md#receipt-based-deadlines)).

Where the starting date isn't known (the date of service, say), the date
waits for a person in **Needs review**.

Where a notice offers a further period (condonation), it is shown as a
separate window, never merged into the due date.

## Proof

Each quote is looked for on its page. Matching ignores spacing and case
(OCR and PDF renderers disagree about word boundaries) and outlines the
quote line by line:

| Grade | Meaning |
|---|---|
| Exact | Found word for word |
| Strong | Found with small differences |
| Approximate | Only part was found |
| Not located | Not found. No outline is drawn, and the finding can't become a deadline until a person confirms it |

Below the matching threshold there is no box at all. A guessed outline in
the wrong place is the one failure Dueproof is built to avoid.

## What it doesn't do

- It doesn't read handwriting.
- It doesn't understand a notice the way a person does. It will miss a duty
  worded in a way its vocabulary doesn't cover, and it can take an
  informative sentence for a duty. **Dismiss** records the mistake; **Add a
  deadline by hand** covers a miss.
- It doesn't file replies or pay anything. It proposes; a person decides.
