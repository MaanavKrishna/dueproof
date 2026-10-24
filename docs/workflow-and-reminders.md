# Workflow and reminders

## Working an obligation

Each obligation on a document card has:

| Control | Effect |
|---|---|
| **State** | *Open*, *Done*, or *Not a duty* (Dueproof was wrong). Only open items appear on the deadline line by default, count towards the badge, or go into digests. |
| **Owner** | Any account, shown by name. Owned items go into the owner's digest. |
| **Due** | Correct the date. The card shows *corrected*, and the document's own date stays recorded. Clear it to go back. |
| **Desk** | Move it to another desk. Filters, the queue and digests follow. |
| **Note** | Free text: who is handling it, what was filed. |
| **History** | Every change: field, old value, new value, who, when. |

Corrections never overwrite what the pipeline found: the original due date and
desks are kept beside the correction, and the history table cannot be edited or
deleted, even by the database user. Corrections are also the cheapest way to
build an accuracy measure — see [Evaluation](evaluation.md).

The **received** date of a document can be corrected on its card. Deadlines
that run "from receipt" move with it; nothing else does.

## The deadline line

The **Deadlines** tab lists dated obligations in the order they fall due:
*Open* by default, or *Done*, *Not a duty*, *All*. *Viewing as* filters to a
desk. **Spreadsheet (CSV)** and **Evidence report** export exactly what is
shown; the report is a printable page with every obligation above a crop of the
page it came from — print it to PDF.

## Reminders

```bash
dueproof digest                       # print every person's digest
dueproof digest --to asha@example.org # just one
dueproof digest --days 14             # look two weeks ahead
dueproof digest --send                # email them
```

A person's digest holds the open obligations **assigned to them**, plus
**unassigned** ones on **their desk**, due within the window — and everything
overdue. Done and dismissed items never appear. With no accounts (sign-in
switched off) there is one digest for everything.

Email settings:

| Variable | |
|---|---|
| `DUEPROOF_SMTP_HOST` | required to send |
| `DUEPROOF_SMTP_PORT` | default 587 |
| `DUEPROOF_SMTP_USER`, `DUEPROOF_SMTP_PASSWORD` | if the server needs them |
| `DUEPROOF_SMTP_FROM` | sender address |
| `DUEPROOF_SMTP_STARTTLS` | `0` to disable STARTTLS |
| `DUEPROOF_URL` | Dueproof's address, so each item links back |

Schedule it with cron (`30 8 * * 1-5 dueproof digest --send`) or the systemd
timer in `deploy/dueproof-digest.timer`.
