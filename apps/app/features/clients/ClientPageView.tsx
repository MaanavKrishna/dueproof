"use client";
/**
 * The client page (01 §4): identifiers, registrations (which build the
 * statutory calendar), contacts with WhatsApp numbers, cases, deadlines,
 * exposure with the interest workings, and people.
 */
import {
  AddIcon,
  CalendarDaysIcon,
  CaseIcon,
  EditIcon,
  ExposureIcon,
  PrintIcon,
  TrashIcon,
  WhatsappIntakeIcon,
} from "@dueproof/icons";
import {
  Amount,
  Avatar,
  AvatarStack,
  Badge,
  Breadcrumbs,
  Button,
  ClientHeader,
  type ClientIdentifier,
  DetailPageTemplate,
  DueChip,
  EmptyState,
  type ExposureRow,
  ExposureSummary,
  IconButton,
  InsetGroupedList,
  ListRow,
  longDate,
  shortDate,
  Tag,
  useToast,
  Workings,
} from "@dueproof/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteContact, deleteRegistration } from "./actions";
import { ClientFormDialog } from "./ClientFormDialog";
import { ContactDialog } from "./ContactDialog";
import styles from "./clients.module.css";
import { DemandDialog } from "./DemandDialog";
import type { ClientPageData, ContactRow, RegistrationRow } from "./queries";
import { RegistrationDialog } from "./RegistrationDialog";

const KIND_LABEL: Record<RegistrationRow["kind"], string> = {
  gst: "GST",
  tds: "TDS (TAN)",
  income_tax: "Income tax (PAN)",
  roc: "ROC (CIN)",
  other: "Other",
};

const STAGE_LABEL: Record<string, string> = {
  received: "Received",
  gathering: "Gathering",
  drafting: "Drafting",
  approval: "Approval",
  filed: "Filed",
  order: "Order",
  appeal: "Appeal",
  closed: "Closed",
};

const TAX_LABEL: Record<string, string> = {
  gst: "GST",
  income_tax: "Income tax",
  tds: "TDS",
  roc: "ROC",
};
const taxLabel = (t: string) => TAX_LABEL[t] ?? t;
const openDemands = (n: number) => `${n} open ${n === 1 ? "demand" : "demands"}`;

export function registrationSummary(r: RegistrationRow): string {
  const a = (r.attributes ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  if (r.frequency)
    parts.push(
      r.frequency === "quarterly" && r.scheme === "qrmp"
        ? "Quarterly (QRMP)"
        : r.frequency[0]?.toUpperCase() + r.frequency.slice(1),
    );
  if (r.scheme && r.scheme !== "qrmp" && r.scheme !== "regular") parts.push(r.scheme);
  if (a.audit === true) parts.push("Tax audit");
  if (a.transferPricing === true) parts.push("Transfer pricing");
  if (typeof a.advanceTax === "string") parts.push(`Advance tax: ${a.advanceTax}`);
  if (a.files24Q === false) parts.push("No 24Q");
  if (a.files26Q === false) parts.push("No 26Q");
  if (typeof a.companyType === "string") parts.push(`Company: ${a.companyType}`);
  const events = a.events as Record<string, { agm?: string }> | undefined;
  for (const [fy, e] of Object.entries(events ?? {}))
    if (e.agm) parts.push(`AGM ${shortDate(e.agm)} (${fy})`);
  return parts.join(" · ") || "No calendar facts yet";
}

/** What the calendar does not cover for one registration, in a line. */
export function coverageSummary(notes: ClientPageData["coverage"], registrationId: string): string {
  const mine = (notes ?? []).filter((n) => n.registrationId === registrationId);
  const check = mine.filter((n) => n.type === "no_rule").map((n) => n.title);
  const missing = mine.filter((n) => n.type === "not_covered").map((n) => n.form);
  const parts: string[] = [];
  if (check.length) parts.push(`Check: ${check.join("; ")}`);
  if (missing.length) parts.push(`Not on the calendar: ${missing.join(", ")}`);
  return parts.join(" · ");
}

export function ClientPageView({ data }: { data: ClientPageData }) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [reg, setReg] = useState<RegistrationRow | "new" | null>(null);
  const [contact, setContact] = useState<ContactRow | "new" | null>(null);
  const [demand, setDemand] = useState(false);
  const c = data.client;
  const names = new Map(data.people.map((p) => [p.id, p.name]));
  const refresh = () => router.refresh();

  const identifiers: ClientIdentifier[] = [
    ...c.gstins.map((g) => {
      const r = data.registrations.find((x) => x.kind === "gst" && x.identifier === g);
      return { type: "GSTIN" as const, value: g, ...(r ? { note: registrationSummary(r) } : {}) };
    }),
    ...(c.pan ? [{ type: "PAN" as const, value: c.pan }] : []),
    ...(c.tan ? [{ type: "TAN" as const, value: c.tan }] : []),
    ...(c.cin ? [{ type: "CIN" as const, value: c.cin }] : []),
  ];
  const open = data.deadlines.filter((d) => d.status === "open");
  const overdue = open.filter((d) => d.state === "overdue");
  const partner = c.partnerUserId ? names.get(c.partnerUserId) : undefined;
  const owners = [
    ...new Set(open.map((d) => d.ownerUserId).filter((x): x is string => Boolean(x))),
  ];

  async function removeRegistration(r: RegistrationRow) {
    const res = await deleteRegistration(c.id, r.id);
    toast(
      res.ok
        ? { title: "Registration removed; calendar rebuilt", tone: "success" }
        : { title: "Couldn't remove it", description: res.message, tone: "danger" },
    );
    refresh();
  }
  async function removeContact(x: ContactRow) {
    const res = await deleteContact(c.id, x.id);
    toast(
      res.ok
        ? { title: "Contact removed", tone: "success" }
        : { title: "Couldn't remove it", description: res.message, tone: "danger" },
    );
    refresh();
  }

  const exposureRows: ExposureRow[] = data.exposure
    ? Object.entries(data.exposure.exposure.clients[c.id]?.byTaxType ?? {}).map(([t, s]) => ({
        id: t,
        label: taxLabel(t),
        sublabel: openDemands(
          data.exposure?.demands.filter((d) => d.taxType === t && d.status === "open").length ?? 0,
        ),
        tax: s.openMinor,
        interest: s.computedInterestMinor,
        penalty: { min: s.penaltyLowMinor, max: s.penaltyHighMinor },
      }))
    : [];

  const tabs = [
    {
      id: "deadlines",
      label: "Deadlines",
      count: open.length,
      content: (
        <div className={styles.section}>
          {open.length ? (
            <InsetGroupedList headingLevel={2} header={`Open · ${overdue.length} overdue`}>
              {open.slice(0, 60).map((d) => (
                <ListRow
                  key={d.id}
                  label={d.title}
                  description={`${d.basis}${d.windowEndOn ? ` · condonation window to ${shortDate(d.windowEndOn)}` : ""} · ${d.ownerUserId ? (names.get(d.ownerUserId) ?? "Someone") : "Unassigned"}`}
                  value={<DueChip state={d.state} detail={shortDate(d.dueOn)} size="sm" />}
                />
              ))}
            </InsetGroupedList>
          ) : (
            <EmptyState
              icon={CalendarDaysIcon}
              size="compact"
              title="Nothing due"
              description="Add a registration to build this client's statutory calendar."
            />
          )}
          <div className={styles.inlineActions}>
            <Button variant="plain" onClick={() => router.push(`/deadlines?client=${c.id}`)}>
              Open in Deadlines
            </Button>
            <Button
              variant="plain"
              icon={PrintIcon}
              onClick={() => router.push(`/reports/statement?client=${c.id}`)}
            >
              Client statement
            </Button>
          </div>
        </div>
      ),
    },
    {
      id: "registrations",
      label: "Registrations",
      count: data.registrations.length,
      content: (
        <div className={styles.section}>
          <InsetGroupedList
            headingLevel={2}
            header="Registrations"
            footer="The statutory calendar is built from these. Rules come from the India pack and are marked for a CA to check."
          >
            {data.registrations.length ? (
              data.registrations.map((r) => (
                <ListRow
                  key={r.id}
                  label={`${KIND_LABEL[r.kind]} · ${r.identifier}`}
                  description={[registrationSummary(r), coverageSummary(data.coverage, r.id)]
                    .filter(Boolean)
                    .join(" · ")}
                  control={
                    data.canEdit ? (
                      <span className={styles.inlineActions}>
                        <IconButton
                          icon={EditIcon}
                          label={`Edit ${r.identifier}`}
                          size="sm"
                          variant="ghost"
                          onClick={() => setReg(r)}
                        />
                        <IconButton
                          icon={TrashIcon}
                          label={`Remove ${r.identifier}`}
                          size="sm"
                          variant="ghost"
                          onClick={() => removeRegistration(r)}
                        />
                      </span>
                    ) : undefined
                  }
                />
              ))
            ) : (
              <ListRow
                label="No registrations yet"
                description="Add a GSTIN with its filing frequency, a TAN, a PAN or a CIN."
              />
            )}
          </InsetGroupedList>
          {data.canEdit ? (
            <div className={styles.inlineActions}>
              <Button icon={AddIcon} onClick={() => setReg("new")}>
                Add registration
              </Button>
            </div>
          ) : null}
        </div>
      ),
    },
    {
      id: "contacts",
      label: "Contacts",
      count: data.contacts.length,
      content: (
        <div className={styles.section}>
          <InsetGroupedList
            headingLevel={2}
            header="Contacts"
            footer="WhatsApp numbers match documents a client forwards to the firm's number."
          >
            {data.contacts.length ? (
              data.contacts.map((x) => (
                <ListRow
                  key={x.id}
                  label={x.role ? `${x.name} · ${x.role}` : x.name}
                  description={
                    [x.email, x.phone, x.whatsapp ? `WhatsApp ${x.whatsapp}` : null]
                      .filter(Boolean)
                      .join(" · ") || "No details"
                  }
                  {...(x.whatsapp ? { icon: WhatsappIntakeIcon } : {})}
                  control={
                    data.canEdit ? (
                      <span className={styles.inlineActions}>
                        <IconButton
                          icon={EditIcon}
                          label={`Edit ${x.name}`}
                          size="sm"
                          variant="ghost"
                          onClick={() => setContact(x)}
                        />
                        <IconButton
                          icon={TrashIcon}
                          label={`Remove ${x.name}`}
                          size="sm"
                          variant="ghost"
                          onClick={() => removeContact(x)}
                        />
                      </span>
                    ) : undefined
                  }
                />
              ))
            ) : (
              <ListRow label="No contacts yet" />
            )}
          </InsetGroupedList>
          {data.canEdit ? (
            <div className={styles.inlineActions}>
              <Button icon={AddIcon} onClick={() => setContact("new")}>
                Add contact
              </Button>
            </div>
          ) : null}
        </div>
      ),
    },
    {
      id: "cases",
      label: "Cases",
      count: data.cases.length,
      content: (
        <div className={styles.section}>
          {data.cases.length ? (
            <InsetGroupedList headingLevel={2} header="Cases">
              {data.cases.map((k) => (
                <ListRow
                  key={k.id}
                  icon={CaseIcon}
                  label={k.title}
                  description={[
                    k.noticeType,
                    k.reference,
                    `opened ${shortDate(k.openedAt.slice(0, 10))}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  value={<Badge size="sm">{STAGE_LABEL[k.stage] ?? k.stage}</Badge>}
                  href={`/notices/${k.id}`}
                />
              ))}
            </InsetGroupedList>
          ) : (
            <EmptyState
              icon={CaseIcon}
              size="compact"
              title="No cases yet"
              description="Notices filed under this client appear here."
            />
          )}
        </div>
      ),
    },
    ...(data.exposure
      ? [
          {
            id: "exposure",
            label: "Exposure",
            content: (
              <div className={styles.section}>
                {exposureRows.length ? (
                  <ExposureSummary
                    title="Exposure"
                    rows={exposureRows}
                    rowHeader="Tax type"
                    asOf={longDate(data.exposure.asOf)}
                  />
                ) : (
                  <EmptyState
                    icon={ExposureIcon}
                    size="compact"
                    title="No open demand"
                    description="Record a demand from a notice or order to see interest and the penalty range."
                  />
                )}
                {data.exposure.workings.map((w) => (
                  <Workings
                    key={w.demandId}
                    title={`${w.title} to ${longDate(data.exposure?.asOf ?? data.today)}`}
                    steps={w.steps.map((s, i) => ({
                      id: `${w.demandId}-${i}`,
                      label: s.label,
                      formula: s.formula,
                      inputs: Object.entries(s.inputs).map(([label, value]) => ({ label, value })),
                      result: s.result,
                    }))}
                    total={{
                      label: "Interest (estimate)",
                      value: <Amount minor={w.amountMinor} estimate />,
                    }}
                    rateSource={`${w.citation}${w.verified ? "" : " · not yet checked by a CA (verify)"}`}
                  />
                ))}
                {data.canEdit && data.cases.length ? (
                  <div className={styles.inlineActions}>
                    <Button icon={AddIcon} onClick={() => setDemand(true)}>
                      Record a demand
                    </Button>
                  </div>
                ) : null}
              </div>
            ),
          },
        ]
      : []),
    {
      id: "people",
      label: "People",
      content: (
        <div className={styles.section}>
          <InsetGroupedList headingLevel={2} header="People">
            <ListRow label="Partner" value={partner ?? "Not set"} />
            {owners.map((o) => (
              <ListRow
                key={o}
                label={names.get(o) ?? "Someone"}
                description={`${open.filter((d) => d.ownerUserId === o).length} open items`}
              />
            ))}
          </InsetGroupedList>
          {c.notes ? (
            <InsetGroupedList headingLevel={2} header="Notes">
              <ListRow label={c.notes} />
            </InsetGroupedList>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <>
      <DetailPageTemplate
        title={c.name}
        breadcrumbs={
          <Breadcrumbs
            items={[
              { id: "clients", label: "Clients", href: "/clients" },
              { id: "client", label: c.name },
            ]}
          />
        }
        actions={
          data.canEdit ? (
            <Button icon={EditIcon} onClick={() => setEditing(true)}>
              Edit client
            </Button>
          ) : undefined
        }
        header={
          <ClientHeader
            name={c.name}
            subtitle={[
              c.legalName && c.legalName !== c.name ? c.legalName : null,
              `${open.length} open · ${overdue.length} overdue`,
            ]
              .filter(Boolean)
              .join(" · ")}
            identifiers={identifiers}
            badges={
              c.tags.length ? c.tags.map((t) => <Tag key={t} label={t} size="sm" />) : undefined
            }
            people={
              partner || owners.length ? (
                <AvatarStack size="xs">
                  {[
                    ...(c.partnerUserId ? [c.partnerUserId] : []),
                    ...owners.filter((o) => o !== c.partnerUserId),
                  ].map((id) => (
                    <Avatar key={id} name={names.get(id) ?? "?"} />
                  ))}
                </AvatarStack>
              ) : undefined
            }
          />
        }
        tabs={tabs}
        defaultTab={data.exposure && exposureRows.length ? "exposure" : "deadlines"}
      />
      <ClientFormDialog
        open={editing}
        onOpenChange={setEditing}
        people={data.people}
        onSaved={refresh}
        initial={{
          id: c.id,
          name: c.name,
          legalName: c.legalName ?? "",
          pan: c.pan ?? "",
          gstins: c.gstins,
          cin: c.cin ?? "",
          tan: c.tan ?? "",
          tags: c.tags,
          partnerUserId: c.partnerUserId,
          notes: c.notes ?? "",
        }}
      />
      {reg ? (
        <RegistrationDialog
          clientId={c.id}
          initial={reg === "new" ? null : reg}
          suggestion={{
            gstin: c.gstins.find((g) => !data.registrations.some((r) => r.identifier === g)) ?? "",
            pan: c.pan ?? "",
            tan: c.tan ?? "",
            cin: c.cin ?? "",
          }}
          onClose={() => setReg(null)}
          onSaved={(msg) => {
            toast({ title: msg, tone: "success" });
            refresh();
          }}
        />
      ) : null}
      {contact ? (
        <ContactDialog
          clientId={c.id}
          initial={contact === "new" ? null : contact}
          onClose={() => setContact(null)}
          onSaved={refresh}
        />
      ) : null}
      {demand ? (
        <DemandDialog
          clientId={c.id}
          cases={data.cases}
          onClose={() => setDemand(false)}
          onSaved={refresh}
        />
      ) : null}
    </>
  );
}
