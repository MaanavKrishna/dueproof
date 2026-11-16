# Workflow and reminders

How a notice moves through Dueproof v0.1, how people work it, and how
Dueproof reminds them.

## Reading a notice

Every upload starts a durable background workflow (Workflow DevKit). Each
step records the document's status, so the Inbox can follow along, and a
step that fails is retried before the document is marked failed.

1. **Inspect**: the engine checks what the file really is (not what its
   name says), counts the pages and spots a password.
2. **Read**: the text layer first; pages without one go through OCR
   (PaddleOCR, then Tesseract where it is installed). On hosted, pages the
   fast engine can't read go to engine-heavy in a Vercel Sandbox.
3. **Translate**: only pages in an Indian language, and only where offline
   translation is set up. See [Languages](languages.md).
4. **Find**: rules find duties, deadlines, hearings, amounts, the
   reference, the issuing office, the sections cited and a summary. Each
   comes with a verbatim quote and a date *rule* ("30 days from receipt"),
   never a bare date. See [Notices](notices.md).
5. **AI assist**: only if the organisation turned AI on, and only where the
   rules weren't confident.
6. **Prove**: each quote is looked for on its page and graded *exact*,
   *strong*, *approximate* or *not located*.
7. **Reconcile and date**: rule and AI findings are merged, and Dueproof's
   date engine (`packages/core`) turns each rule into a date, using the
   organisation's working days and holidays.
8. **Write**: findings, their proof and deadlines are saved. The document
   ends **Ready** or **Needs review**.

A finding becomes a deadline straight away only when its quote is on the
page and nothing about it is doubtful. Otherwise it waits in **Needs
review** until a person confirms it. A finding that isn't on the page never
becomes a deadline on its own.

## Working a case

A notice is filed in a **case**, with its client. The case moves through
stages:

**Received → Documents gathered → Draft reply → Partner approval → Filed on
portal → Order received → Appeal → Closed**

- Moving to the next stage needs nothing more. Skipping a stage, or going
  back, needs a reason.
- **Ask for approval** moves a case to Partner approval. Someone who may
  approve replies, and didn't ask, chooses **Approve reply**. Going on
  without approval needs a reason.
- **Filed on portal** needs the acknowledgement or ARN number, and the
  acknowledgement uploaded to the case's **Thread**. Dueproof never files
  anything.
- Every move is in the case's **Activity**, with who and when.

## Working a deadline

| Action | Where | Effect |
|---|---|---|
| **Mark done** / **Reopen** | Deadlines row ⋯; case duty's More actions | Done items leave the open list, the digest and reminders |
| **Assign to** | Deadlines row ⋯ | The deadline's owner is told straight away, and gets its reminders. (**Assign** on a case page sets the case's owner, which is separate) |
| **Snooze** | Deadlines row ⋯ | Until tomorrow, for 3 days or for a week. A snoozed item stays out of the digest and reminders until then |
| **Dismiss** | Deadlines row ⋯ | It wasn't a real deadline |
| **Correct due date** | Case duty's More actions | Needs a reason. The original date is kept beside the correction |
| **Correct the received date** | Case header or More actions | Every open deadline counted from receipt is worked out again |
| **Add a deadline** | Deadlines, or **Add a deadline by hand** on a case | For a date agreed with an officer, a hearing, or anything the notices don't show |

Nothing Dueproof found is overwritten. Corrections sit beside it, and the
audit trail records every change, chained so an edit or a deletion shows
(**Settings → System → Audit trail**).

## Statutory deadlines

Add a client's registrations (GST, TDS, income tax, ROC) on its
**Registrations** tab and choose **Save and rebuild calendar**. Dueproof
adds that client's recurring returns and payments to **Deadlines**, marked
*Statutory*. Each period and due day is data with a source, and is marked
"Rule not yet checked by a CA" until a CA signs it off.

## Reminders

### The daily run

One job, once a day, does three things for every organisation:

1. **Due soon and overdue.** A deadline's owner is told when it is due
   within two days, and again when it is overdue.
2. **Escalation.** An item overdue for 3 days goes to the managers (or, if
   there are none, the owners and admins); after 7 days, to the client's
   partner (or the owners). Change the days in **Settings → Organisation →
   Escalation**. Each escalation is noted in the case's Activity.
3. **The morning digest.** Each person with something to see gets one
   email: what is overdue, due today and due this week among the deadlines
   they own, and, for owners, admins and managers, cases awaiting
   approval. Nobody gets an empty digest.

Running it twice in a day sends nothing new.

The job is `GET /api/cron/daily`, called with
`Authorization: Bearer <CRON_SECRET>`. Without `CRON_SECRET` the route
doesn't exist.

- **Hosted:** Vercel Cron calls it at 01:15 UTC (06:45 in India), from
  `apps/app/vercel.ts`. Set `CRON_SECRET`, and `RESEND_API_KEY` for email.
- **Self-hosted:** the `daily` service in `compose.yaml` calls it every day
  at `DAILY_AT` (default `07:00`, in `TZ`), over the internal network, with
  `CRON_SECRET` from `.env`. No host crontab is needed. After a restart past
  that time it catches up at once, and a failed call is retried every 10
  minutes for two hours. Its log (`docker compose logs daily`) shows each
  run's counts. To run it now:

  ```bash
  docker compose exec daily node /scripts/daily.mjs now
  ```

Email needs `SMTP_URL` and `MAIL_FROM` in `.env` (hosted: `RESEND_API_KEY`).
With no mail settings, `MAIL_DRIVER` is `log`: nothing is emailed, and a
digest that wasn't emailed isn't counted as sent, so that day's digests go
out on the next run once mail is set up. Notifications and escalations work
either way.

### Notifications

| Notification | When |
|---|---|
| A deadline is coming up | Due within two days (daily run) |
| A deadline needs attention | Overdue (daily run) |
| An overdue item needs attention | Escalated to you (daily run) |
| Something was assigned to you | Someone assigns you a deadline (straight away) |
| You were mentioned | Someone @mentions you in a case's Activity (straight away) |

Each is sent once per person and item.

- **Web Push**, per device: **Settings → Me → Notifications → Notifications
  on this device**. On an iPhone, add Dueproof to the Home Screen first.
  `PUSH_ENABLED=0` turns it off for the whole install. A push carries only
  the generic line above: no client names, amounts or notice text.
- **The desktop app**: while it is open, it looks for new notifications
  every minute and shows each as a system alert. See
  [Desktop app](desktop.md).

The bell in the sidebar doesn't list notifications yet in v0.1.

### Calendar feeds

**Deadlines → Subscribe (iCal)** makes a private link for **My deadlines**
or **All deadlines**. Add it to Google Calendar, Outlook or Apple Calendar
as a subscription. It holds titles and dates only. **Turn off my feed
links** stops every link you made.
