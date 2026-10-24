"""Reminders: what each person has falling due, by email or on the terminal.

    dueproof digest                 print every person's digest
    dueproof digest --send          email them (DUEPROOF_SMTP_* settings)

Run it from cron or a systemd timer each morning. A person's digest holds the
open obligations assigned to them, plus unassigned ones on their desk; with no
accounts at all, one digest covers everything.
"""
from __future__ import annotations

import os
import smtplib
import ssl
from datetime import date
from email.message import EmailMessage

from dueproof import db
from dueproof.config import PRODUCT, today

def items_for(user: dict | None, days: int, now: date | None = None) -> list[dict]:
    """Open dated obligations due within `days` (and everything overdue) that
    belong to `user`: assigned to them, or unassigned on their desk."""
    now = now or today()
    horizon = date.fromordinal(now.toordinal() + days).isoformat()
    where, args = ["f.kind='obligation'", "f.status='open'",
                   "COALESCE(f.due_override, f.due_date) IS NOT NULL",
                   "COALESCE(f.due_override, f.due_date) <= ?"], [horizon]
    if user:
        where.append("(f.assignee=? OR (f.assignee IS NULL AND EXISTS (SELECT 1 FROM json_each("
                     "COALESCE(f.roles_override, f.roles)) j WHERE j.value=?)))")
        args += [user["email"], user["desk"] or ""]
    rows = db.q("SELECT f.id, f.doc_id, COALESCE(f.due_override, f.due_date) due, f.text_en,"
                " f.text_local, f.page_num, d.title, d.reference FROM findings f"
                f" JOIN documents d ON d.id=f.doc_id WHERE {' AND '.join(where)}"
                " ORDER BY due, f.id", args)
    for r in rows:
        r["days_left"] = (date.fromisoformat(r["due"]) - now).days
    return rows

def render(items: list[dict], name: str, days: int, base_url: str = "") -> str:
    overdue = [i for i in items if i["days_left"] < 0]
    soon = [i for i in items if i["days_left"] >= 0]
    lines = [f"Hello {name},", "",
             f"{len(overdue)} overdue and {len(soon)} due in the next {days} days."]
    for heading, group in (("Overdue", overdue), (f"Due in the next {days} days", soon)):
        if not group:
            continue
        lines += ["", heading, "-" * len(heading)]
        for i in group:
            when = (f"{-i['days_left']} days overdue" if i["days_left"] < 0
                    else "today" if i["days_left"] == 0 else f"in {i['days_left']} days")
            text = " ".join((i["text_en"] or i["text_local"] or "").split())
            lines.append(f"* {i['due']} ({when}) — {text[:160]}")
            lines.append(f"  {i['title']}{' · ' + i['reference'] if i['reference'] else ''}"
                         f" · page {i['page_num']}"
                         + (f" · {base_url.rstrip('/')}/#doc={i['doc_id']}" if base_url else ""))
    lines += ["", f"— {PRODUCT}"]
    return "\n".join(lines)

def recipients() -> list[dict]:
    users = db.q("SELECT * FROM users WHERE disabled=0 ORDER BY email")
    return users or [None]

def send(to: str, subject: str, body: str) -> None:
    host = os.environ.get("DUEPROOF_SMTP_HOST")
    if not host:
        raise SystemExit("Set DUEPROOF_SMTP_HOST (and _PORT, _USER, _PASSWORD, _FROM) to send mail")
    msg = EmailMessage()
    msg["From"] = os.environ.get("DUEPROOF_SMTP_FROM", f"{PRODUCT} <dueproof@localhost>")
    msg["To"], msg["Subject"] = to, subject
    msg.set_content(body)
    port = int(os.environ.get("DUEPROOF_SMTP_PORT", "587"))
    with smtplib.SMTP(host, port, timeout=30) as smtp:
        if os.environ.get("DUEPROOF_SMTP_STARTTLS", "1") != "0":
            smtp.starttls(context=ssl.create_default_context())
        if user := os.environ.get("DUEPROOF_SMTP_USER"):
            smtp.login(user, os.environ.get("DUEPROOF_SMTP_PASSWORD", ""))
        smtp.send_message(msg)

def run(days: int = 7, deliver: bool = False, only: str | None = None,
        base_url: str = "") -> list[tuple[str, int]]:
    """Build (and optionally send) every digest. Returns (recipient, items)."""
    sent = []
    for user in recipients():
        if only and (not user or user["email"].lower() != only.lower()):
            continue
        items = items_for(user, days)
        if not items:
            continue
        name = (user["name"] if user else None) or "team"
        body = render(items, name, days, base_url)
        overdue = sum(i["days_left"] < 0 for i in items)
        subject = (f"{PRODUCT}: {overdue} overdue, {len(items) - overdue} due soon")
        if deliver and user:
            send(user["email"], subject, body)
        else:
            print(f"=== {user['email'] if user else 'everyone'} — {subject}\n{body}\n")
        sent.append((user["email"] if user else "everyone", len(items)))
    return sent
