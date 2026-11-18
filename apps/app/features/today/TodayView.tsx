"use client";
import {
  ApprovalIcon,
  CalendarStatutoryIcon,
  ExposureIcon,
  HearingIcon,
  InboxIcon,
  OverdueIcon,
  ProofIcon,
  TodayIcon,
  WeekIcon,
} from "@dueproof/icons";
import {
  Amount,
  Avatar,
  Button,
  Card,
  DueChip,
  EmptyState,
  ExposureSummary,
  IconButton,
  Link,
  ListPageTemplate,
  SegmentedControl,
  StatCard,
  StatusPill,
} from "@dueproof/ui";
import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { ProofSheet, type ProofTarget } from "@/components/ProofSheet";
import styles from "@/components/screen.module.css";
import type { TodayData, TodayRow, TodayScope } from "./queries";

const SCOPE_LABEL: Record<TodayScope, string> = {
  mine: "Mine",
  team: "My team",
  everyone: "Everyone",
};

const SEE_ALL = 6;

const statusWords: Record<
  string,
  { label: string; tone: "neutral" | "accent" | "warning" | "danger" | "success" }
> = {
  ready: { label: "Ready", tone: "success" },
  needs_review: { label: "Needs review", tone: "warning" },
  needs_password: { label: "Needs password", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
  quarantined: { label: "Quarantined", tone: "danger" },
};

/** Where a row leads: its case, else the Inbox to file it, else its detail on Deadlines. */
function rowHref(row: Pick<TodayRow, "id" | "caseId" | "unfiled">): string {
  if (row.caseId) return `/cases/${row.caseId}`;
  if (row.unfiled) return "/inbox";
  return `/deadlines?deadline=${encodeURIComponent(row.id)}`;
}

function Row({ row, onProof }: { row: TodayRow; onProof: (r: TodayRow) => void }) {
  const title = (
    <Link asChild variant="subtle">
      <NextLink href={rowHref(row)}>{row.title}</NextLink>
    </Link>
  );
  return (
    <li className={styles.listItem}>
      <span className={styles.cellStack}>
        <span className={`${styles.ellipsis} ${styles.strong}`}>
          {row.client ?? "No client yet"}
        </span>
        <span className={styles.ellipsis}>{title}</span>
      </span>
      {row.unfiled ? (
        <span className={styles.small}>{row.dueLabel}</span>
      ) : (
        <DueChip state={row.state} detail={row.dueLabel} size="sm" />
      )}
      {row.owner ? (
        <Avatar name={row.owner} size="xs" />
      ) : (
        <span className={styles.small}>Unassigned</span>
      )}
      {row.source === "statutory" || !row.documentId ? (
        <IconButton
          icon={CalendarStatutoryIcon}
          label={`Rule: ${row.basis}`}
          size="sm"
          variant="ghost"
        />
      ) : (
        <IconButton
          icon={ProofIcon}
          label={`Show where “${row.title}” is on the page`}
          size="sm"
          variant="ghost"
          onClick={() => onProof(row)}
        />
      )}
    </li>
  );
}

function Bucket({
  title,
  icon,
  rows,
  empty,
  onProof,
  href,
  note,
}: {
  title: string;
  icon: ReactNode;
  rows: TodayRow[];
  empty: string;
  onProof: (r: TodayRow) => void;
  href: string;
  note?: string;
}) {
  return (
    <Card
      title={
        <span className={styles.row}>
          {icon}
          {title}
          <span className={styles.muted}>{rows.length}</span>
        </span>
      }
      headingLevel={2}
      padding="md"
      actions={
        rows.length > SEE_ALL ? (
          <Link asChild>
            <NextLink href={href}>See all</NextLink>
          </Link>
        ) : undefined
      }
    >
      {note ? <p className={styles.small}>{note}</p> : null}
      {rows.length ? (
        <ul className={styles.list} aria-label={title}>
          {rows.slice(0, SEE_ALL).map((r) => (
            <Row key={r.id} row={r} onProof={onProof} />
          ))}
        </ul>
      ) : (
        <p className={styles.small}>{empty}</p>
      )}
    </Card>
  );
}

export function TodayView({ data, summary }: { data: TodayData; summary: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [proof, setProof] = useState<ProofTarget | null>(null);
  const openProof = (r: TodayRow) =>
    r.documentId &&
    setProof({
      documentId: r.documentId,
      findingId: r.findingId,
      title: `${r.client ?? "No client"} · ${r.title}`,
      caseHref: r.caseId ? `/cases/${r.caseId}` : null,
    });
  const greeting = data.firstName ? `${data.todayLabel} · ${data.firstName}` : data.todayLabel;
  const nothing =
    !data.overdue.length &&
    !data.dueToday.length &&
    !data.thisWeek.length &&
    !data.hearings.length &&
    !data.notFiled.length &&
    !data.pastWhenAdded.length &&
    !data.review.count &&
    !data.recent.length;

  return (
    <ListPageTemplate
      title="Today"
      subtitle={
        <>
          {greeting} — {summary}
        </>
      }
      scrollPage
      actions={
        data.scopes.length > 1 ? (
          <SegmentedControl
            aria-label="Whose work"
            size="sm"
            value={data.scope}
            onValueChange={(v) => router.replace(`${pathname}?scope=${v}`)}
            segments={data.scopes.map((s) => ({ value: s, label: SCOPE_LABEL[s] }))}
          />
        ) : undefined
      }
      summary={
        <div className={styles.stats}>
          <StatCard
            label="Overdue"
            icon={OverdueIcon}
            value={String(data.overdue.length)}
            tone={data.overdue.length ? "attention" : "default"}
            href="/deadlines"
          />
          <StatCard
            label="Due this week"
            icon={WeekIcon}
            value={String(data.dueToday.length + data.thisWeek.length)}
            href="/deadlines"
          />
          <StatCard
            label="To review"
            icon={ProofIcon}
            value={String(data.review.count)}
            href="/inbox"
          />
          {data.exposure ? (
            <StatCard
              label="Open demand"
              icon={ExposureIcon}
              value={<Amount minor={data.exposure.openMinor} compact size="xl" />}
              footnote={
                <>
                  Interest to date <Amount minor={data.exposure.interestMinor} compact estimate />
                </>
              }
              {...(data.exposure.deltaMinor
                ? {
                    delta: {
                      value: `${data.exposure.deltaMinor > 0 ? "+" : "−"}${(Math.abs(data.exposure.deltaMinor) / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })}`,
                      direction: data.exposure.deltaMinor > 0 ? ("up" as const) : ("down" as const),
                      tone:
                        data.exposure.deltaMinor > 0
                          ? ("negative" as const)
                          : ("positive" as const),
                      period: "since the start of the month",
                    },
                  }
                : {})}
              href="/reports/exposure"
            />
          ) : null}
        </div>
      }
    >
      <div className={styles.content}>
        {nothing ? (
          <EmptyState
            icon={InboxIcon}
            size="hero"
            headingLevel={2}
            title="Nothing is due yet"
            description="Upload a notice and Dueproof finds what's owed and by when, with the page as proof."
            actions={
              <Button variant="primary" onClick={() => router.push("/inbox")}>
                Upload a notice
              </Button>
            }
          />
        ) : null}
        <div className={styles.grid}>
          <Bucket
            title="Overdue"
            icon={<OverdueIcon />}
            rows={data.overdue}
            empty="Nothing overdue."
            onProof={openProof}
            href="/deadlines?due=overdue"
          />
          <Bucket
            title="Due today"
            icon={<TodayIcon />}
            rows={data.dueToday}
            empty="Nothing due today."
            onProof={openProof}
            href="/deadlines?due=today"
          />
          <Bucket
            title="This week"
            icon={<WeekIcon />}
            rows={data.thisWeek}
            empty="Nothing else due in the next seven days."
            onProof={openProof}
            href="/deadlines?due=week"
          />
          <Bucket
            title="Hearings this week"
            icon={<HearingIcon />}
            rows={data.hearings}
            empty="No hearings in the next seven days."
            onProof={openProof}
            href="/deadlines?kind=hearing"
          />
          {data.pastWhenAdded.length ? (
            <Bucket
              title="Already past when added"
              icon={<CalendarStatutoryIcon />}
              rows={data.pastWhenAdded}
              empty=""
              note="These periods were already due when the registration was added. Mark the ones already filed as done; the rest are overdue."
              onProof={openProof}
              href="/deadlines"
            />
          ) : null}
          {data.notFiled.length ? (
            <Bucket
              title="Not filed yet"
              icon={<InboxIcon />}
              rows={data.notFiled}
              empty=""
              note="Read from documents not filed in a case. They aren't counted as due until someone files the document, or sets it aside as not a notice."
              onProof={openProof}
              href="/inbox"
            />
          ) : null}
          <Card
            title={
              <span className={styles.row}>
                <ProofIcon />
                Needs review <span className={styles.muted}>{data.review.count}</span>
              </span>
            }
            headingLevel={2}
            padding="md"
            actions={
              data.review.count ? (
                <Link asChild>
                  <NextLink href="/inbox">Review</NextLink>
                </Link>
              ) : undefined
            }
          >
            {data.review.items.length ? (
              <ul className={styles.list} aria-label="Needs review">
                {data.review.items.map((f) => (
                  <li key={f.id} className={styles.listItem}>
                    <span className={styles.cellStack}>
                      <span className={`${styles.ellipsis} ${styles.strong}`}>
                        {f.client ?? "No client yet"}
                      </span>
                      <span className={styles.ellipsis}>{f.title}</span>
                    </span>
                    <span />
                    <span />
                    <IconButton
                      icon={ProofIcon}
                      size="sm"
                      variant="ghost"
                      label={`Show where “${f.title}” is on the page`}
                      onClick={() =>
                        setProof({
                          documentId: f.documentId,
                          findingId: f.id,
                          title: f.title,
                          caseHref: f.caseId ? `/cases/${f.caseId}` : null,
                        })
                      }
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.small}>Nothing waits for review.</p>
            )}
          </Card>
          <Card
            title={
              <span className={styles.row}>
                <InboxIcon />
                Recently received
              </span>
            }
            headingLevel={2}
            padding="md"
            actions={
              <Link asChild>
                <NextLink href="/inbox">Inbox</NextLink>
              </Link>
            }
          >
            {data.recent.length ? (
              <ul className={styles.list} aria-label="Recently received">
                {data.recent.map((d) => {
                  const s = statusWords[d.status] ?? { label: "Reading", tone: "accent" as const };
                  return (
                    <li key={d.id} className={styles.listItem}>
                      <span className={styles.cellStack}>
                        <span className={`${styles.ellipsis} ${styles.strong}`}>
                          {d.caseId ? (
                            <Link asChild variant="subtle">
                              <NextLink href={`/cases/${d.caseId}`}>{d.name}</NextLink>
                            </Link>
                          ) : (
                            d.name
                          )}
                        </span>
                        <span className={styles.small}>
                          {d.client ?? "No client yet"} · {d.at}
                        </span>
                      </span>
                      <StatusPill label={s.label} tone={s.tone} />
                      <span />
                      <span />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={styles.small}>Nothing received in the last seven days.</p>
            )}
          </Card>
          {data.approvals ? (
            <Card
              title={
                <span className={styles.row}>
                  <ApprovalIcon />
                  Awaiting approval <span className={styles.muted}>{data.approvals.length}</span>
                </span>
              }
              headingLevel={2}
              padding="md"
            >
              {data.approvals.length ? (
                <ul className={styles.list} aria-label="Awaiting approval">
                  {data.approvals.map((c) => (
                    <li key={c.id} className={styles.listItem}>
                      <span className={styles.cellStack}>
                        <span className={`${styles.ellipsis} ${styles.strong}`}>
                          {c.client ?? "No client yet"}
                        </span>
                        <Link asChild variant="subtle">
                          <NextLink href={`/cases/${c.id}`}>{c.reference ?? c.title}</NextLink>
                        </Link>
                      </span>
                      <span />
                      <span />
                      <span />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.small}>No replies wait for your approval.</p>
              )}
            </Card>
          ) : null}
        </div>
        {data.exposure?.top.length ? (
          <ExposureSummary
            title="Exposure: five largest clients"
            asOf={data.todayLabel}
            rows={data.exposure.top.map((t) => ({
              id: t.id,
              label: t.label,
              tax: t.openMinor,
              interest: t.interestMinor,
              penalty: t.penalty,
            }))}
          />
        ) : null}
      </div>
      <ProofSheet target={proof} onClose={() => setProof(null)} />
    </ListPageTemplate>
  );
}
