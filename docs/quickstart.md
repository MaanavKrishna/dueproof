# Quickstart

## 1. An account

```bash
dueproof users add asha@example.org --name "Asha Menon" --desk "GST & Indirect Tax" --admin
```

The desk is what Asha sees by default. Desks come from the [profile](profiles.md);
`dueproof users list` shows who exists.

## 2. Start it

```bash
dueproof serve
```

Open <http://127.0.0.1:8000> and sign in.

## 3. A notice

Drop a PDF or a photo on the left. Within seconds you get:

- **What it is** — type, reference, issuing office, amount demanded, the
  provisions it cites, and when it was received (today, unless you change it).
- **What it says** — a few summary lines.
- **What must happen** — each duty with its due date, its desk, and a *page*
  pill. Click the pill: the page opens on the right with the sentence outlined.

A deadline like "within 30 days of receipt" counts from the received date. If
the notice actually arrived last week, click **change** next to *Received*; the
deadline moves with it.

## 4. Work it

On each obligation: set the **owner**, correct the **due** date or **desk**,
add a **note**, and set the **state** to *Done* (or *Not a duty* if Dueproof
got it wrong). **History** shows every change. Nothing the pipeline found is
overwritten — corrections sit beside it.

The **Deadlines** tab lists every open obligation in date order. The badge on
it counts what falls due this week on your desk. **Evidence report** gives a
printable page — print it to PDF for a meeting or an inspection.

## 5. Reminders

```bash
dueproof digest
```

prints each person's open items for the coming week. With SMTP settings,
`dueproof digest --send` emails them; schedule it with cron or the systemd timer
in `deploy/`. See [Workflow and reminders](workflow-and-reminders.md).

## 6. Many documents at once

```bash
dueproof ingest /path/to/folder --channel "GST portal"
```

Safe to repeat: identical files are recognised and skipped.
