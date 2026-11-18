"use client";
/**
 * Deadlines (01 §4): list grouped by week, calendar (month/week, holidays
 * shaded) and timeline, with filters for client, person, type, status and
 * source. Notice, order, statutory and manual items sit together, each
 * labelled with its source and the basis that produced the date. The
 * condonation window is always a separate line, never merged.
 */
import {
  AddIcon,
  CalendarDaysIcon,
  CalendarStatutoryIcon,
  ClientIcon,
  DownloadIcon,
  FilterIcon,
  NoticeIcon,
  OrderIcon,
  UserIcon,
} from "@dueproof/icons";
import {
  Badge,
  Button,
  Calendar,
  type CalendarEvent,
  DueChip,
  EmptyState,
  FilterBar,
  type FilterDefinition,
  type FilterValue,
  InsetGroupedList,
  ListPageTemplate,
  ListRow,
  SegmentedControl,
  shortDate,
  Timeline,
  type TimelineItem,
  type TimelineTone,
  useMediaQuery,
  useToast,
} from "@dueproof/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { DeadlineRow, DeadlineSource } from "@/lib/deadline-rows";
import { AddDeadlineDialog } from "./AddDeadlineDialog";
import { DeadlineActions } from "./DeadlineActions";
import { DeadlineDetailDialog } from "./DeadlineDetailDialog";
import styles from "./deadlines.module.css";
import { FeedMenu } from "./FeedMenu";
import { applyFilters, groupByWeek } from "./group";
import { SOURCE_LABEL, TYPE_LABEL } from "./labels";
import type { DeadlinesPageData } from "./queries";

export type View = "list" | "calendar" | "timeline";

const SOURCE_TONE = {
  notice: "info",
  order: "warning",
  statutory: "neutral",
  manual: "accent",
} as const;
const SOURCE_ICON = {
  notice: NoticeIcon,
  order: OrderIcon,
  statutory: CalendarStatutoryIcon,
  manual: AddIcon,
} as const;

export function SourceBadge({ source }: { source: DeadlineSource }) {
  return (
    <Badge size="sm" tone={SOURCE_TONE[source]} icon={SOURCE_ICON[source]}>
      {SOURCE_LABEL[source]}
    </Badge>
  );
}

function filtersFromParams(params: URLSearchParams): FilterValue {
  const out: FilterValue = {};
  for (const k of ["client", "person", "type", "status", "source"]) {
    const v = params.get(k);
    if (v) out[k] = v.split(",").filter(Boolean);
  }
  return out;
}

export function DeadlinesView({
  data,
  initialView,
}: {
  data: DeadlinesPageData;
  initialView: View;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [view, setView] = useState<View>(initialView);
  const [filters, setFilters] = useState<FilterValue>(() =>
    filtersFromParams(new URLSearchParams(params.toString())),
  );
  const [selected, setSelected] = useState<DeadlineRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [, startTransition] = useTransition();
  const { toast } = useToast();
  const phone = useMediaQuery("(max-width: 40rem)");

  const people = useMemo(() => new Map(data.people.map((p) => [p.id, p.name])), [data.people]);
  const definitions: FilterDefinition[] = useMemo(
    () => [
      {
        id: "client",
        label: "Client",
        icon: ClientIcon,
        options: [
          ...data.clients.map((c) => ({ value: c.id, label: c.name })),
          { value: "none", label: "No client" },
        ],
      },
      {
        id: "person",
        label: "Person",
        icon: UserIcon,
        options: [
          ...data.people.map((p) => ({
            value: p.id,
            label: p.id === data.me ? `${p.name} (me)` : p.name,
          })),
          { value: "none", label: "Unassigned" },
        ],
      },
      {
        id: "type",
        label: "Type",
        icon: FilterIcon,
        options: Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })),
      },
      {
        id: "status",
        label: "Status",
        options: [
          { value: "open", label: "Open" },
          { value: "snoozed", label: "Snoozed" },
          { value: "done", label: "Done" },
          { value: "dismissed", label: "Dismissed" },
        ],
      },
      {
        id: "source",
        label: "Source",
        icon: CalendarDaysIcon,
        options: (Object.keys(SOURCE_LABEL) as DeadlineSource[]).map((s) => ({
          value: s,
          label: SOURCE_LABEL[s],
        })),
      },
    ],
    [data.clients, data.people, data.me],
  );

  const rows = useMemo(
    () => applyFilters(data.rows, filters, data.today),
    [data.rows, filters, data.today],
  );
  const open = data.rows.filter((r) => r.status === "open");
  const overdue = open.filter((r) => r.state === "overdue").length;

  function syncUrl(nextFilters: FilterValue, nextView: View) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(nextFilters)) if (v.length) q.set(k, v.join(","));
    if (nextView !== "list") q.set("view", nextView);
    const s = q.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }

  const refresh = () => startTransition(() => router.refresh());
  const csvHref = `/api/v1/reports/deadlines.csv?${new URLSearchParams(
    Object.entries(filters).flatMap(([k, v]) => (v.length ? [[k, v.join(",")]] : [])),
  ).toString()}`;

  const holidays = data.holidays.map((h) => ({ date: h.date, name: h.name }));

  return (
    <ListPageTemplate
      title="Deadlines"
      subtitle={`${open.length.toLocaleString("en-IN")} open · ${overdue.toLocaleString("en-IN")} overdue · times in ${data.timezone === "Asia/Kolkata" ? "IST" : data.timezone}`}
      scrollPage
      actions={
        <>
          {/* On phones only "Add deadline" stays in the bar (Subscribe and CSV are desk tasks). */}
          {phone ? null : <FeedMenu />}
          {phone ? null : (
            <Button
              icon={DownloadIcon}
              onClick={() => {
                window.location.href = csvHref;
              }}
            >
              Export CSV
            </Button>
          )}
          {/* Viewers read only: no button that the server would refuse. */}
          {data.canEdit ? (
            <AddDeadlineDialog
              open={adding}
              onOpenChange={setAdding}
              data={data}
              onAdded={() => {
                toast({ title: "Deadline added", tone: "success" });
                refresh();
              }}
            />
          ) : null}
        </>
      }
      filterBar={
        <FilterBar
          filters={definitions}
          value={filters}
          onChange={(v) => {
            setFilters(v);
            syncUrl(v, view);
          }}
          trailing={
            <SegmentedControl
              aria-label="View"
              size="sm"
              value={view}
              onValueChange={(v) => {
                setView(v as View);
                syncUrl(filters, v as View);
              }}
              segments={[
                { value: "list", label: "List" },
                { value: "calendar", label: "Calendar" },
                { value: "timeline", label: "Timeline" },
              ]}
            />
          }
        />
      }
    >
      {view === "list" ? (
        <DeadlineList
          rows={rows}
          today={data.today}
          people={people}
          data={data}
          onChanged={refresh}
          compact={phone}
        />
      ) : view === "calendar" ? (
        <div className={styles.pad}>
          <Calendar
            label="Deadlines calendar"
            today={data.today}
            events={rows.map(toEvent)}
            holidays={holidays}
            onEventSelect={(e) =>
              setSelected(data.rows.find((r) => r.id === e.id.replace(/:window$/, "")) ?? null)
            }
          />
        </div>
      ) : (
        <DeadlineTimeline rows={rows} today={data.today} people={people} />
      )}
      <DeadlineDetailDialog
        row={selected}
        onOpenChange={(o) => {
          if (!o) setSelected(null);
        }}
        people={people}
        data={data}
        onChanged={() => {
          setSelected(null);
          refresh();
        }}
      />
    </ListPageTemplate>
  );
}

function toEvent(r: DeadlineRow): CalendarEvent {
  return {
    id: r.id,
    date: r.dueOn,
    title: r.title,
    state: r.state,
    kind: r.source === "statutory" ? "statutory" : r.source === "order" ? "order" : "notice",
    ...(r.clientName ? { client: r.clientName } : {}),
  };
}

export function describeRow(r: DeadlineRow, people: Map<string, string>): string {
  const parts: string[] = [];
  if (r.clientName) parts.push(r.clientName);
  parts.push(r.basis);
  parts.push(r.ownerUserId ? (people.get(r.ownerUserId) ?? "Someone") : "Unassigned");
  if (r.snoozedUntil) parts.push(`Snoozed until ${shortDate(r.snoozedUntil)}`);
  if (r.statutory && !r.statutory.verified) parts.push("Rule not yet checked by a CA");
  return parts.join(" · ");
}

function DeadlineList({
  rows,
  today,
  people,
  data,
  onChanged,
  compact = false,
}: {
  rows: DeadlineRow[];
  today: string;
  people: Map<string, string>;
  data: DeadlinesPageData;
  onChanged: () => void;
  /** Phones: the due chip sits under the title and the basis is left to the detail. */
  compact?: boolean;
}) {
  const groups = groupByWeek(rows, today);
  if (!groups.length) {
    return (
      <EmptyState
        icon={CalendarDaysIcon}
        title="Nothing due"
        description="No deadlines match these filters. Add a client's registrations to see its statutory calendar, or upload a notice."
      />
    );
  }
  return (
    <div className={styles.groups}>
      {groups.map((g) => (
        <InsetGroupedList
          key={g.id}
          header={
            <span className={styles.groupHeader}>
              <span>{g.label}</span>
              {g.range ? <span className={styles.muted}>{g.range}</span> : null}
              <span className={styles.muted}>{g.rows.length}</span>
            </span>
          }
        >
          {g.rows.map((r) => (
            <ListRow
              key={r.id}
              label={
                <span className={styles.rowTitle}>
                  <span>{r.title}</span>
                  <SourceBadge source={r.source} />
                </span>
              }
              description={
                <span className={styles.rowDescription}>
                  {compact ? (
                    <span>
                      <DueChip state={r.state} detail={shortDate(r.dueOn)} size="sm" />
                    </span>
                  ) : null}
                  <span>{compact ? (r.clientName ?? "No client") : describeRow(r, people)}</span>
                  {r.windowEndOn ? (
                    <span className={styles.window}>
                      Condonation window to {shortDate(r.windowEndOn)}
                      {r.windowBasis ? ` · ${r.windowBasis}` : ""}
                    </span>
                  ) : null}
                </span>
              }
              {...(compact
                ? {}
                : { value: <DueChip state={r.state} detail={shortDate(r.dueOn)} size="sm" /> })}
              {...(data.canEdit
                ? { control: <DeadlineActions row={r} data={data} onChanged={onChanged} /> }
                : {})}
            />
          ))}
        </InsetGroupedList>
      ))}
    </div>
  );
}

const TONE: Record<DeadlineRow["state"], TimelineTone> = {
  overdue: "danger",
  today: "warning",
  week: "accent",
  later: "neutral",
  done: "success",
};

function DeadlineTimeline({
  rows,
  today,
  people,
}: {
  rows: DeadlineRow[];
  today: string;
  people: Map<string, string>;
}) {
  const items: TimelineItem[] = [...rows]
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
    .slice(0, 300)
    .map((r) => ({
      id: r.id,
      title: r.title,
      time: shortDate(r.dueOn),
      dateTime: r.dueOn,
      description: describeRow(r, people),
      icon: SOURCE_ICON[r.source],
      tone: TONE[r.state],
      status:
        r.status !== "open" || r.dueOn < today
          ? "complete"
          : r.dueOn === today
            ? "current"
            : "upcoming",
      meta: <DueChip state={r.state} size="sm" />,
      ...(r.windowEndOn
        ? {
            children: (
              <span className={styles.window}>
                Condonation window to {shortDate(r.windowEndOn)}
              </span>
            ),
          }
        : {}),
    }));
  if (!items.length) {
    return (
      <EmptyState
        icon={CalendarDaysIcon}
        title="Nothing due"
        description="No deadlines match these filters."
      />
    );
  }
  return (
    <div className={styles.pad}>
      <Timeline aria-label="Deadlines timeline" items={items} density="compact" />
    </div>
  );
}
