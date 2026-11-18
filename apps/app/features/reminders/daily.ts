/**
 * The daily job (01 §4 "Daily digest and escalation"), once per organisation:
 *
 * 0. The statutory calendar rolls forward: every client with registrations
 *    is regenerated for today's window (idempotent; see lib/statutory.ts),
 *    so the steps below see this month's returns.
 * 1. Notifications: "due soon" (due within 2 days) and "overdue" to each
 *    item's owner, once per item and day. The owner is the deadline's
 *    owner, else its case's owner, else its client's partner. An item with
 *    none of these goes to the managers (else admins and owners) on the
 *    same day, not first through the escalation days later.
 * 2. Escalation: an item overdue for N days goes to the managers, and after
 *    M days to the client's partner (org_settings.escalation_days; default
 *    3 and 7). Each escalation is a notification and an audit line on the
 *    case (its activity).
 * 3. The morning digest by email to each person with something to see,
 *    once per person per day; unowned items appear in the managers' digest.
 *
 * Snoozing hides an item until its due date at most: once an item is due
 * today or late it is notified and escalated whatever the snooze says.
 *
 * Idempotent: running it twice on a day sends nothing new.
 */
import "server-only";
import { listOrganisations, listOrgPeople, type OrgPerson } from "@dueproof/auth";
import { addDays } from "@dueproof/core";
import { and, audit, cases, clients, eq, orgSettings, schema, withOrg } from "@dueproof/db";
import { loadOrgCalendar } from "@/lib/calendar";
import { type DeadlineRow, queryDeadlines } from "@/lib/deadline-rows";
import { type Mailer, mailerFor } from "@/lib/mail";
import { notify } from "@/lib/notify";
import { todayIn } from "@/lib/pipeline/status";
import type { Container } from "@/lib/server/container";
import { regenerateOrgStatutory } from "@/lib/statutory";
import { renderDigest } from "./digest";

export const DEFAULT_ESCALATION = { manager: 3, partner: 7 } as const;
const DUE_SOON_DAYS = 2;

export interface DailyResult {
  orgs: number;
  /** Clients whose statutory calendar was regenerated, and new rows it wrote. */
  statutoryClients: number;
  statutoryInserted: number;
  notifications: number;
  escalations: number;
  digests: number;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export async function runDaily(
  c: Pick<Container, "database" | "env" | "mailer">,
  options: { today?: string; mailer?: Mailer } = {},
): Promise<DailyResult> {
  const mailer = options.mailer ?? mailerFor(c);
  const result: DailyResult = {
    orgs: 0,
    statutoryClients: 0,
    statutoryInserted: 0,
    notifications: 0,
    escalations: 0,
    digests: 0,
  };
  for (const org of await listOrganisations(c.database)) {
    result.orgs += 1;
    const r = await runForOrg(c, org, mailer, options.today);
    result.statutoryClients += r.statutoryClients;
    result.statutoryInserted += r.statutoryInserted;
    result.notifications += r.notifications;
    result.escalations += r.escalations;
    result.digests += r.digests;
  }
  return result;
}

async function runForOrg(
  c: Pick<Container, "database" | "env">,
  org: { id: string; name: string },
  mailer: Mailer,
  todayOverride?: string,
) {
  const out = {
    statutoryClients: 0,
    statutoryInserted: 0,
    notifications: 0,
    escalations: 0,
    digests: 0,
  };
  const cal = await loadOrgCalendar(c, org.id);
  const today = todayOverride ?? todayIn(cal.timezone);

  // 0: roll the statutory window forward.
  const statutory = await regenerateOrgStatutory(c.database, org.id, { today });
  out.statutoryClients = statutory.clients;
  out.statutoryInserted = statutory.inserted;

  const people = await listOrgPeople(c.database, org.id);
  const { open, partners, caseOwners, escalation, approvals, sentDigests } = await withOrg(
    c.database,
    org.id,
    async (tx) => {
      const [settings] = await tx
        .select({ escalation: orgSettings.escalationDays })
        .from(orgSettings)
        .where(eq(orgSettings.orgId, org.id))
        .limit(1);
      // Snoozed items are read too: a snooze never hides an item that is due or late.
      const rows = await queryDeadlines(tx, org.id, today, {
        statuses: ["open"],
        to: addDays(today, 7),
      });
      const partnerRows = await tx
        .select({ id: clients.id, partner: clients.partnerUserId })
        .from(clients)
        .where(eq(clients.orgId, org.id));
      const caseRows = await tx
        .select({ id: cases.id, owner: cases.ownerUserId })
        .from(cases)
        .where(eq(cases.orgId, org.id));
      const approvalRows = await tx
        .select({ id: cases.id, title: cases.title, clientName: clients.name })
        .from(cases)
        .leftJoin(clients, and(eq(clients.orgId, cases.orgId), eq(clients.id, cases.clientId)))
        .where(and(eq(cases.orgId, org.id), eq(cases.stage, "approval")));
      const digestRows = await tx
        .select({ targetId: schema.audit.targetId, detail: schema.audit.detail })
        .from(schema.audit)
        .where(and(eq(schema.audit.orgId, org.id), eq(schema.audit.action, "digest.sent")));
      return {
        open: rows.filter((d) => !(d.snoozedUntil && d.dueOn > today)),
        partners: new Map(partnerRows.map((p) => [p.id, p.partner])),
        caseOwners: new Map(caseRows.map((c) => [c.id, c.owner])),
        escalation: settings?.escalation ?? DEFAULT_ESCALATION,
        approvals: approvalRows,
        sentDigests: new Set(
          digestRows
            .filter((d) => (d.detail as { day?: string } | null)?.day === today)
            .map((d) => d.targetId),
        ),
      };
    },
  );

  const managers = people.filter((p) => p.role === "manager");
  const escalateTo = managers.length
    ? managers
    : people.filter((p) => p.role === "admin" || p.role === "owner");
  const owners = people.filter((p) => p.role === "owner");
  const members = new Set(people.map((p) => p.userId));

  /** Who answers for an item: its owner, its case's owner, its client's partner. */
  const ownerOf = (d: DeadlineRow): string | null => {
    for (const id of [
      d.ownerUserId,
      d.caseId ? caseOwners.get(d.caseId) : null,
      d.clientId ? partners.get(d.clientId) : null,
    ])
      if (id && members.has(id)) return id;
    return null;
  };
  /** The people told about an item on time: its owner, else the managers. */
  const recipientsOf = (d: DeadlineRow): string[] => {
    const o = ownerOf(d);
    return o ? [o] : escalateTo.map((p) => p.userId);
  };

  // 1 and 2: notifications and escalation.
  for (const d of open) {
    const href = d.caseId ? `/notices/${d.caseId}` : "/deadlines";
    const late = daysBetween(d.dueOn, today);
    const owner = ownerOf(d);
    const unowned = owner ? "" : " (no owner)";
    if (late <= 0 && -late <= DUE_SOON_DAYS) {
      for (const userId of recipientsOf(d)) {
        if (
          await notify(c, org.id, {
            userId,
            kind: "deadline.due_soon",
            key: `due_soon:${d.id}:${d.dueOn}`,
            payload: {
              title: `${d.title} is due ${late === 0 ? "today" : `on ${d.dueOn}`}${unowned}`,
              href,
              deadlineId: d.id,
            },
          })
        )
          out.notifications += 1;
      }
    }
    if (late <= 0) continue;
    for (const userId of recipientsOf(d)) {
      if (
        await notify(c, org.id, {
          userId,
          kind: "deadline.overdue",
          key: `overdue:${d.id}:${d.dueOn}`,
          payload: { title: `${d.title} is overdue${unowned}`, href, deadlineId: d.id },
        })
      )
        out.notifications += 1;
    }
    const steps: { level: "manager" | "partner"; to: OrgPerson[] }[] = [];
    if (late >= escalation.manager) steps.push({ level: "manager", to: escalateTo });
    if (late >= escalation.partner) {
      const partnerId = d.clientId ? partners.get(d.clientId) : null;
      const partner = partnerId ? people.filter((p) => p.userId === partnerId) : owners;
      steps.push({ level: "partner", to: partner });
    }
    for (const step of steps) {
      let any = false;
      for (const p of step.to) {
        if (p.userId === owner) continue;
        const created = await notify(c, org.id, {
          userId: p.userId,
          kind: "deadline.escalated",
          key: `escalated:${step.level}:${d.id}:${d.dueOn}`,
          payload: {
            title: `${d.title}${d.clientName ? ` (${d.clientName})` : ""} is ${late} days overdue`,
            href,
            deadlineId: d.id,
            level: step.level,
          },
        });
        any ||= created;
      }
      if (any) {
        out.escalations += 1;
        await withOrg(c.database, org.id, (tx, scope) =>
          audit.write(tx, scope, {
            actor: null,
            action: `deadline.escalated.${step.level}`,
            targetType: d.caseId ? "case" : "deadline",
            targetId: d.caseId ?? d.id,
            detail: { deadlineId: d.id, daysOverdue: late },
          }),
        );
      }
    }
  }

  // 3: the morning digest.
  for (const p of people) {
    if (sentDigests.has(p.userId)) continue;
    const mine = open.filter((d) => recipientsOf(d).includes(p.userId));
    const approver = p.role === "owner" || p.role === "admin" || p.role === "manager";
    const digest = renderDigest({
      orgName: org.name,
      personName: p.name,
      today,
      appUrl: c.env.APP_URL,
      overdue: mine.filter((d: DeadlineRow) => d.dueOn < today),
      dueToday: mine.filter((d) => d.dueOn === today),
      thisWeek: mine.filter((d) => d.dueOn > today),
      awaitingApproval: approver ? approvals : [],
    });
    if (digest.empty) continue;
    try {
      const sent = await mailer.send({
        to: p.email,
        subject: digest.subject,
        html: digest.html,
        text: digest.text,
      });
      // The log driver only records the message: nothing left the install, so
      // the digest isn't marked sent (it goes out once mail is set up).
      if (!sent.delivered) continue;
    } catch {
      // A mail failure is retried on the next run; the digest isn't marked sent.
      continue;
    }
    out.digests += 1;
    await withOrg(c.database, org.id, (tx, scope) =>
      audit.write(tx, scope, {
        actor: null,
        action: "digest.sent",
        targetType: "user",
        targetId: p.userId,
        detail: { day: today },
      }),
    );
  }
  return out;
}
