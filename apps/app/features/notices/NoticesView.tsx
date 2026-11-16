"use client";
import {
  CalendarIcon,
  CaseIcon,
  ChevronDownIcon,
  ClientIcon,
  DownloadIcon,
  NoticeIcon,
  UploadIcon,
  UserIcon,
} from "@dueproof/icons";
import {
  Amount,
  Avatar,
  Button,
  caseStages,
  DataTable,
  type DataTableColumn,
  Dialog,
  DueChip,
  EmptyState,
  FilterBar,
  type FilterDefinition,
  type FilterValue,
  ListPageTemplate,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  SearchField,
  StatusPill,
  Switch,
  TextField,
  useToast,
} from "@dueproof/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";
import styles from "@/components/screen.module.css";
import { bulkUpdate, deleteView, exportNoticesCsv, saveView, undoBulk } from "./actions";
import { applyFilters, NO_OWNER, type NoticeRow } from "./model";
import type { NoticesData } from "./queries";

const stageOrder = new Map(caseStages.map((s, i) => [s.id, i]));
const stageShort = new Map(caseStages.map((s) => [s.id, s.short]));
const dueOrder = { overdue: 0, today: 1, week: 2, later: 3, done: 4 } as const;
const BULK_STAGES = caseStages.filter((s) => !["approval", "filed"].includes(s.id));

const columns: DataTableColumn<NoticeRow>[] = [
  {
    id: "client",
    header: "Client",
    width: "xl",
    accessor: (r) => r.client ?? "",
    cell: (r) => (
      <span className={styles.cellStack}>
        <span className={`${styles.ellipsis} ${styles.strong}`}>{r.client ?? "No client yet"}</span>
        {r.gstin ? <span className={`${styles.mono} ${styles.muted}`}>{r.gstin}</span> : null}
      </span>
    ),
  },
  { id: "type", header: "Type", width: "md", accessor: (r) => r.type },
  {
    id: "reference",
    header: "Reference",
    width: "md",
    accessor: (r) => r.reference ?? "",
    cell: (r) => <span className={styles.mono}>{r.reference ?? "—"}</span>,
  },
  {
    id: "issuedBy",
    header: "Issued by",
    width: "lg",
    accessor: (r) => r.issuedBy ?? "",
    defaultHidden: true,
  },
  {
    id: "received",
    header: "Received",
    width: "sm",
    accessor: (r) => r.receivedIso,
    cell: (r) => r.received,
  },
  {
    id: "due",
    header: "Next due",
    width: "lg",
    accessor: (r) => (r.nextDue ? `${dueOrder[r.nextDue.state]}-${r.nextDue.iso}` : null),
    cell: (r) =>
      r.nextDue ? (
        <DueChip state={r.nextDue.state} detail={r.nextDue.date} size="sm" />
      ) : (
        <span className={styles.muted}>No deadline found</span>
      ),
  },
  {
    id: "stage",
    header: "Stage",
    width: "sm",
    accessor: (r) => stageOrder.get(r.stage) ?? 0,
    cell: (r) => (
      <StatusPill
        label={stageShort.get(r.stage) ?? r.stage}
        tone={r.stage === "closed" ? "neutral" : r.stage === "approval" ? "warning" : "accent"}
      />
    ),
  },
  {
    id: "demand",
    header: "Demand",
    width: "sm",
    align: "end",
    accessor: (r) => r.demandMinor,
    cell: (r) =>
      r.demandMinor ? (
        <Amount minor={r.demandMinor} compact />
      ) : (
        <span className={styles.muted}>—</span>
      ),
  },
  {
    id: "owner",
    header: "Owner",
    width: "md",
    accessor: (r) => r.owner ?? "",
    cell: (r) =>
      r.owner ? (
        <span className={styles.row}>
          <Avatar name={r.owner} size="xs" />
          <span className={styles.ellipsis}>{r.owner}</span>
        </span>
      ) : (
        <span className={styles.muted}>Unassigned</span>
      ),
  },
  {
    id: "language",
    header: "Language",
    width: "sm",
    accessor: (r) => r.language,
    defaultHidden: true,
  },
  { id: "channel", header: "Source", width: "xs", accessor: (r) => r.channel, defaultHidden: true },
];

const BUILT_IN = [
  { id: "all", name: "All notices", filters: {} as FilterValue },
  { id: "mine", name: "Assigned to me", filters: { owner: ["me"] } as FilterValue },
  {
    id: "open",
    name: "Open",
    filters: {
      stage: ["received", "gathering", "drafting", "approval", "filed", "order", "appeal"],
    },
  },
];

export function NoticesView({
  data,
  canAssign,
  canMove,
}: {
  data: NoticesData;
  canAssign: boolean;
  canMove: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [filters, setFilters] = useState<FilterValue>({});
  const [query, setQuery] = useState("");
  const [viewId, setViewId] = useState<string | undefined>("all");
  const [saving, setSaving] = useState(false);
  const [viewName, setViewName] = useState("");
  const [shared, setShared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const all: FilterValue = useMemo(
    () => ({ ...filters, ...(query.trim() ? { q: [query.trim()] } : {}) }),
    [filters, query],
  );
  const rows = useMemo(() => applyFilters(data.rows, all, data.me), [data.rows, all, data.me]);
  const overdue = data.rows.filter((r) => r.nextDue?.state === "overdue").length;

  const filterDefs: FilterDefinition[] = useMemo(() => {
    const clientsSeen = new Map<string, string>();
    for (const r of data.rows) clientsSeen.set(r.clientId ?? NO_OWNER, r.client ?? "No client yet");
    const types = [...new Set(data.rows.map((r) => r.type))];
    return [
      {
        id: "due",
        label: "Due",
        icon: CalendarIcon,
        options: [
          { value: "overdue", label: "Overdue" },
          { value: "today", label: "Due today" },
          { value: "week", label: "This week" },
          { value: "later", label: "Later" },
          { value: "none", label: "No deadline" },
        ],
      },
      {
        id: "stage",
        label: "Stage",
        icon: CaseIcon,
        options: caseStages.map((s) => ({ value: s.id, label: s.label })),
      },
      {
        id: "owner",
        label: "Owner",
        icon: UserIcon,
        options: [
          { value: "me", label: "Me" },
          ...data.people
            .filter((p) => p.id !== data.me)
            .map((p) => ({ value: p.id, label: p.name })),
          { value: NO_OWNER, label: "Unassigned" },
        ],
      },
      {
        id: "client",
        label: "Client",
        icon: ClientIcon,
        options: [...clientsSeen].map(([value, label]) => ({ value, label })),
      },
      {
        id: "type",
        label: "Type",
        icon: NoticeIcon,
        options: types.map((t) => ({ value: t, label: t })),
      },
    ];
  }, [data.rows, data.people, data.me]);

  const views = [
    ...BUILT_IN.map((v) => ({ id: v.id, name: v.name })),
    ...data.views.map((v) => ({ id: v.id, name: v.name, shared: v.shared })),
  ];

  function selectView(id: string) {
    setViewId(id);
    const v = BUILT_IN.find((b) => b.id === id) ?? data.views.find((s) => s.id === id);
    const { q, ...rest } = (v?.filters ?? {}) as FilterValue;
    setFilters(rest);
    setQuery(q?.[0] ?? "");
  }

  async function submitView(e: FormEvent) {
    e.preventDefault();
    const r = await saveView({ name: viewName, filters: all, shared });
    if (!r.ok) return setError(r.message);
    setSaving(false);
    setViewName("");
    toast({ tone: "success", title: "View saved", description: viewName });
    router.refresh();
    setViewId(r.data.id);
  }

  async function bulk(
    ids: string[],
    clear: () => void,
    change: { ownerUserId?: string | null; stage?: string },
    words: string,
  ) {
    const r = await bulkUpdate({ caseIds: ids, ...change } as Parameters<typeof bulkUpdate>[0]);
    if (!r.ok) return toast({ tone: "danger", title: "Nothing changed", description: r.message });
    clear();
    router.refresh();
    toast({
      tone: "success",
      title: `${ids.length} case${ids.length === 1 ? "" : "s"} ${words}`,
      duration: 8000,
      action: {
        label: "Undo",
        altText: "Undo the change",
        onClick: () =>
          void undoBulk(r.data).then((u) => {
            if (u.ok) router.refresh();
            else toast({ tone: "danger", title: "Couldn't undo", description: u.message });
          }),
      },
    });
  }

  async function exportCsv() {
    setExporting(true);
    const r = await exportNoticesCsv(all);
    setExporting(false);
    if (!r.ok) return toast({ tone: "danger", title: "Export failed", description: r.message });
    const url = URL.createObjectURL(new Blob([r.data.csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = r.data.filename;
    a.click();
    URL.revokeObjectURL(url);
    toast({ tone: "success", title: `Exported ${r.data.count} rows` });
  }

  const mine = data.views.find((v) => v.id === viewId && v.mine);
  return (
    <ListPageTemplate
      title="Notices"
      subtitle={`${data.rows.length.toLocaleString("en-IN")} case${data.rows.length === 1 ? "" : "s"} · ${overdue.toLocaleString("en-IN")} overdue${rows.length !== data.rows.length ? ` · ${rows.length.toLocaleString("en-IN")} shown` : ""}`}
      actions={
        <>
          <Button icon={DownloadIcon} onClick={() => void exportCsv()} loading={exporting}>
            Export CSV
          </Button>
          <Button variant="primary" icon={UploadIcon} onClick={() => router.push("/inbox")}>
            Upload notice
          </Button>
        </>
      }
      filterBar={
        <FilterBar
          filters={filterDefs}
          value={filters}
          onChange={(v) => {
            setFilters(v);
            setViewId(undefined);
          }}
          views={views}
          activeViewId={viewId}
          onViewSelect={selectView}
          onSaveView={() => {
            setError(null);
            setSaving(true);
          }}
          search={
            <SearchField
              label="Search notices"
              size="sm"
              placeholder="Client, reference, GSTIN"
              value={query}
              onValueChange={(v) => {
                setQuery(v);
                setViewId(undefined);
              }}
            />
          }
          trailing={
            mine ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void deleteView(mine.id).then((r) => {
                    if (r.ok) {
                      selectView("all");
                      router.refresh();
                    }
                  })
                }
              >
                Delete view
              </Button>
            ) : undefined
          }
        />
      }
    >
      <DataTable
        label="Notices"
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        selectable={canAssign || canMove}
        defaultSorting={[{ id: "due", desc: false }]}
        onRowClick={(r) => router.push(`/cases/${r.id}`)}
        empty={
          data.rows.length ? (
            <EmptyState
              size="compact"
              title="No cases match"
              description="Clear a filter or choose another view."
            />
          ) : (
            <EmptyState
              icon={NoticeIcon}
              title="No notices yet"
              description="Upload a notice in the Inbox and open a case for it."
              actions={
                <Button variant="primary" icon={UploadIcon} onClick={() => router.push("/inbox")}>
                  Upload notice
                </Button>
              }
            />
          )
        }
        bulkActions={({ ids, clear }) => (
          <>
            {canAssign ? (
              <Menu>
                <MenuTrigger>
                  <Button size="sm" icon={UserIcon} iconEnd={ChevronDownIcon}>
                    Assign
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  {data.people.map((p) => (
                    <MenuItem
                      key={p.id}
                      onSelect={() =>
                        void bulk(ids, clear, { ownerUserId: p.id }, `assigned to ${p.name}`)
                      }
                    >
                      {p.name}
                    </MenuItem>
                  ))}
                  <MenuItem
                    onSelect={() => void bulk(ids, clear, { ownerUserId: null }, "unassigned")}
                  >
                    Nobody
                  </MenuItem>
                </MenuContent>
              </Menu>
            ) : null}
            {canMove ? (
              <Menu>
                <MenuTrigger>
                  <Button size="sm" iconEnd={ChevronDownIcon}>
                    Move stage
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  {BULK_STAGES.map((s) => (
                    <MenuItem
                      key={s.id}
                      icon={s.icon}
                      onSelect={() => void bulk(ids, clear, { stage: s.id }, `moved to ${s.label}`)}
                    >
                      {s.label}
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
            ) : null}
          </>
        )}
      />
      <Dialog open={saving} onOpenChange={setSaving} title="Save this view" size="sm">
        <form className={styles.stack} onSubmit={submitView}>
          <TextField
            label="Name"
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
            placeholder="Overdue GST notices"
            {...(error ? { error } : {})}
            autoFocus
          />
          {canAssign ? (
            <Switch
              label="Share with the organisation"
              checked={shared}
              onCheckedChange={setShared}
            />
          ) : null}
          <div className={styles.row}>
            <Button type="submit" variant="primary">
              Save view
            </Button>
            <Button type="button" variant="secondary" onClick={() => setSaving(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>
    </ListPageTemplate>
  );
}
