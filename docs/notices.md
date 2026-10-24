# Notices

What Dueproof pulls out of a notice, and the rules behind each item. Everything
is rule-based and explainable: for any finding you can point to the words that
caused it.

## About the document

| Field | How it is found |
|---|---|
| **Type** | Keywords weighted by where they appear — the masthead and the file name count more than the body. Types and keywords come from the [profile](profiles.md). |
| **Reference** | A label from the profile's `REFERENCE_LABELS` ("Reference No", "DIN", "Notice No", "ARN", …) followed by an identifier, near the top of page one. |
| **Issued by** | A name from the profile's `AUTHORITIES` list anywhere in the text; failing that, an "Office of the …" heading or a top line naming an office. |
| **Amount demanded** | The largest ₹ / Rs. / INR amount in a line that talks about paying (demand, payable, tax, penalty, interest, outstanding…). Lakh and crore are converted. An invoice's line items are not a demand. |
| **Provisions** | "Section 143(2)", "u/s 148A(b)", "Rule 86A", "Regulation 30", "Article 226", normalised. |
| **Date** | The date labelled as such ("Date:", "Dated"), else the first date in the opening text. |
| **Received** | The day the document arrived in Dueproof, or the date you set. |

## Obligations

A sentence is an obligation because it **directs someone** — "you are hereby
directed to", "shall", "must", "furnish", "pay the", "appear before" and the
rest of the profile's `OBLIGATION_CUES`. A bare date is not enough: issue dates
and tax periods carry dates too.

A date becomes the **due date** only beside a deadline marker ("on or before",
"within", "not later than", "by", "due date"…). Relative deadlines are
resolved:

- **"within 30 days of receipt"**, "from the date of service" — counted from the
  **received** date. These are marked *N days from receipt*, and move if you
  correct the received date. The notice cannot know when it reached you, so
  Dueproof never guesses this from the issue date.
- **"within 15 days"** with no mention of receipt — counted from the document's
  own date.

A **hearing** — "a personal hearing is fixed on 18 November 2026" — is an
obligation with a due date even without a deadline marker, and is tagged
*hearing*.

Each obligation also carries the provision its sentence cites, a severity
(*high* when the sentence speaks of penalty, prosecution, show cause,
attachment, …) and its desks.

## Desks

A finding goes to every desk whose keywords it mentions, up to three. In the
default profile, a notice's type also decides its main desk: every finding in a
GST notice goes to *GST & Indirect Tax* first. Anything still unrouted goes to
the profile's default desk. You can move a finding to another desk; see
[Workflow](workflow-and-reminders.md).

## What it does not do

- It does not read handwriting.
- It does not understand a notice the way a person does. It will miss a duty
  phrased in a way the profile's vocabulary does not cover, and it can mistake
  an informative sentence for a duty. *Not a duty* in the app records the
  mistake; [`dueproof eval`](evaluation.md) measures how often it happens on your
  documents.
- It does not file replies or pay anything. It proposes; a person decides.
