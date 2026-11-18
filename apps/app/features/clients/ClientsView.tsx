"use client";
/** Clients (01 §4): the register, with import from CSV, a new-client form and merging duplicates. */
import { AddIcon, ClientIcon, DownloadIcon, UploadIcon, UsersIcon } from "@dueproof/icons";
import {
  Amount,
  Badge,
  Banner,
  Button,
  DataTable,
  type DataTableColumn,
  EmptyState,
  ListPageTemplate,
  SearchField,
  Tag,
} from "@dueproof/ui";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { plural } from "@/lib/plural";
import { ClientFormDialog } from "./ClientFormDialog";
import styles from "./clients.module.css";
import { ImportDialog } from "./ImportDialog";
import { MergeDialog } from "./MergeDialog";
import type { ClientListRow } from "./queries";

export interface ClientsViewProps {
  rows: ClientListRow[];
  people: { id: string; name: string }[];
  canEdit: boolean;
  canSeeExposure: boolean;
  duplicates: { key: string; clients: { id: string; name: string }[] }[];
  /** Open "New client" at once (/clients?new=1, from Today and the palette). */
  openNew?: boolean;
  openImport?: boolean;
}

export function ClientsView({
  rows,
  people,
  canEdit,
  canSeeExposure,
  duplicates,
  openNew,
  openImport,
}: ClientsViewProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(Boolean(openNew && canEdit));
  const [importing, setImporting] = useState(Boolean(openImport && canEdit));
  const [merging, setMerging] = useState<(typeof duplicates)[number] | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.name, r.legalName, r.pan, r.cin, r.tan, ...r.gstins, ...r.tags, r.partnerName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, query]);

  const columns: DataTableColumn<ClientListRow>[] = [
    {
      id: "name",
      header: "Client",
      accessor: (r) => r.name,
      width: "lg",
      cell: (r) => (
        <span className={styles.nameCell}>
          <span className={styles.name}>{r.name}</span>
          {r.legalName && r.legalName !== r.name ? (
            <span className={styles.muted}>{r.legalName}</span>
          ) : null}
        </span>
      ),
    },
    {
      id: "ids",
      header: "GSTIN · PAN · CIN",
      accessor: (r) => r.gstins[0] ?? r.pan ?? r.cin ?? "",
      width: "lg",
      cell: (r) => (
        <span className={styles.ids}>
          {r.gstins[0] ? (
            <span>
              {r.gstins[0]}
              {r.gstins.length > 1 ? ` +${r.gstins.length - 1}` : ""}
            </span>
          ) : null}
          {r.pan ? <span className={styles.muted}>{r.pan}</span> : null}
          {r.cin ? <span className={styles.muted}>{r.cin}</span> : null}
        </span>
      ),
    },
    { id: "open", header: "Open items", accessor: (r) => r.openItems, align: "end", width: "sm" },
    {
      id: "overdue",
      header: "Overdue",
      accessor: (r) => r.overdue,
      align: "end",
      width: "sm",
      cell: (r) =>
        r.overdue ? (
          <Badge tone="danger" size="sm">
            {r.overdue}
          </Badge>
        ) : (
          <span className={styles.muted}>0</span>
        ),
    },
    ...(canSeeExposure
      ? [
          {
            id: "exposure",
            header: "Exposure",
            accessor: (r: ClientListRow) => r.exposureMinor ?? 0,
            align: "end" as const,
            width: "md" as const,
            cell: (r: ClientListRow) =>
              r.exposureMinor ? (
                <Amount minor={r.exposureMinor} compact estimate />
              ) : (
                <span className={styles.muted}>—</span>
              ),
          },
        ]
      : []),
    { id: "partner", header: "Partner", accessor: (r) => r.partnerName ?? "", width: "md" },
    {
      id: "tags",
      header: "Tags",
      sortable: false,
      width: "md",
      cell: (r) => (
        <span className={styles.tags}>
          {r.tags.map((t) => (
            <Tag key={t} label={t} size="sm" />
          ))}
        </span>
      ),
    },
  ];

  const withOverdue = rows.filter((r) => r.overdue > 0).length;
  return (
    <ListPageTemplate
      title="Clients"
      subtitle={`${plural(rows.length, "client")} · ${withOverdue.toLocaleString("en-IN")} with something overdue`}
      actions={
        <>
          <Button
            icon={DownloadIcon}
            onClick={() => {
              window.location.href = "/api/v1/reports/clients.csv";
            }}
          >
            Export CSV
          </Button>
          {canEdit ? (
            <>
              <Button icon={UploadIcon} onClick={() => setImporting(true)}>
                Import
              </Button>
              <Button variant="primary" icon={AddIcon} onClick={() => setCreating(true)}>
                New client
              </Button>
            </>
          ) : null}
        </>
      }
      banner={
        canEdit && duplicates.length ? (
          <Banner
            tone="info"
            icon={UsersIcon}
            title={`${duplicates.length} possible duplicate${duplicates.length > 1 ? "s" : ""}`}
          >
            <span className={styles.dupes}>
              {duplicates.slice(0, 3).map((d) => (
                <Button key={d.key} size="sm" variant="plain" onClick={() => setMerging(d)}>
                  {d.clients.map((c) => c.name).join(" and ")} share {d.key}
                </Button>
              ))}
            </span>
          </Banner>
        ) : undefined
      }
      filterBar={
        <SearchField
          label="Search clients"
          size="sm"
          placeholder="Name, GSTIN, PAN, tag"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      }
    >
      <DataTable
        label="Clients"
        columns={columns}
        data={filtered}
        getRowId={(r) => r.id}
        defaultSorting={[{ id: "name", desc: false }]}
        onRowClick={(r) => router.push(`/clients/${r.id}`)}
        empty={
          <EmptyState
            icon={ClientIcon}
            title={rows.length ? "No clients match" : "No clients yet"}
            description={
              rows.length
                ? "Try another name, GSTIN or PAN."
                : "Add a client, or import a list from Tally or Zoho saved as CSV. Their registrations build the statutory calendar."
            }
            actions={
              !rows.length && canEdit ? (
                <Button variant="primary" icon={AddIcon} onClick={() => setCreating(true)}>
                  New client
                </Button>
              ) : undefined
            }
          />
        }
      />
      <ClientFormDialog
        open={creating}
        onOpenChange={setCreating}
        people={people}
        onSaved={(id) => router.push(`/clients/${id}`)}
      />
      <ImportDialog open={importing} onOpenChange={setImporting} onDone={() => router.refresh()} />
      <MergeDialog
        group={merging}
        onOpenChange={(o) => {
          if (!o) setMerging(null);
        }}
        onDone={() => {
          setMerging(null);
          router.refresh();
        }}
      />
    </ListPageTemplate>
  );
}
