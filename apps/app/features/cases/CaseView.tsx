"use client";
import {
  AddIcon,
  AiSuggestedIcon,
  AppealIcon,
  ApprovalIcon,
  ArrowLeftIcon,
  CalendarStatutoryIcon,
  DocumentIcon,
  DoneIcon,
  EditIcon,
  FiledAckIcon,
  HearingPackIcon,
  MoreIcon,
  NoticeIcon,
  OrderIcon,
  PrintIcon,
  ProofIcon,
  UndoIcon,
  UserIcon,
} from "@dueproof/icons";
import {
  ActivityFeed,
  Amount,
  Banner,
  Breadcrumbs,
  Button,
  Card,
  CommentComposer,
  DetailPageTemplate,
  DueChip,
  EmptyState,
  FindingCard,
  IconButton,
  LanguageIndicator,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  NoticeHeader,
  OriginBadge,
  ProofViewer,
  Select,
  Skeleton,
  StageStepper,
  StatusPill,
  Timeline,
  useMediaQuery,
  useToast,
  Workings,
} from "@dueproof/ui";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { confirmFinding, dismissFinding, restoreFinding } from "@/app/actions/findings";
import { type EditableFinding, EditFindingDialog } from "@/components/EditFindingDialog";
import styles from "@/components/screen.module.css";
import { UploadPanel } from "@/components/UploadPanel";
import { useProof } from "@/components/useProof";
import type { UploadRole } from "@/components/useUploads";
import { addAppealWindow, addComment, approveCase, assignCase, setDeadlineStatus } from "./actions";
import {
  CorrectDueDialog,
  DemandForm,
  HistoryDialog,
  ManualDeadlineDialog,
  ReceivedDialog,
  StageDialog,
} from "./CaseDialogs";
import type { CaseData, CaseDemand, CaseFinding } from "./queries";

const ROLE_ICON = {
  notice: NoticeIcon,
  reply: EditIcon,
  acknowledgement: FiledAckIcon,
  order: OrderIcon,
  appeal: AppealIcon,
  attachment: DocumentIcon,
  other: DocumentIcon,
} as const;
const ROLE_WORD: Record<string, string> = {
  notice: "Notice",
  reply: "Reply",
  acknowledgement: "Acknowledgement",
  order: "Order",
  appeal: "Appeal",
  attachment: "Supporting paper",
  other: "Document",
};

const LANGUAGE: Record<string, string> = {
  hi: "Hindi",
  mr: "Marathi",
  ta: "Tamil",
  te: "Telugu",
  kn: "Kannada",
  gu: "Gujarati",
  bn: "Bengali",
  ml: "Malayalam",
  pa: "Punjabi",
  ur: "Urdu",
};

export function CaseView({
  data,
  initial,
}: {
  data: CaseData;
  initial: { documentId?: string; findingId?: string; page?: number };
}) {
  const router = useRouter();
  const { toast } = useToast();
  // The page sits beside the case only when there is room (80rem, where
  // SplitView stops overlaying). Narrower, on a phone or at 200% zoom, it
  // would cover the case, so it starts closed and opens on demand (H4).
  // Closed on the server too, so a phone never paints it first.
  const roomy = useMediaQuery("(width >= 80rem)");
  const [inspectorChoice, setInspectorOpen] = useState<boolean | null>(null);
  const inspectorOpen = inspectorChoice ?? roomy;
  const [activeFinding, setActiveFinding] = useState<string | null>(
    initial.findingId ?? data.findings.find((f) => f.deadline)?.id ?? data.findings[0]?.id ?? null,
  );
  const [docId, setDocId] = useState<string | null>(initial.documentId ?? data.notice?.id ?? null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [stageTo, setStageTo] = useState<string | null>(null);
  const [receivedOpen, setReceivedOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [correctDue, setCorrectDue] = useState<{
    deadlineId: string;
    title: string;
    iso: string;
  } | null>(null);
  const [editing, setEditing] = useState<EditableFinding | null>(null);
  const [editingDemand, setEditingDemand] = useState<Partial<CaseDemand> | null>(null);
  const [uploadRole, setUploadRole] = useState<UploadRole>("reply");
  const [tab, setTab] = useState("duties");

  const preloaded = data.proof && data.proof.documentId === docId ? data.proof : null;
  const { proof: loaded, error: proofError } = useProof(preloaded ? null : docId);
  const proof = preloaded ?? loaded;

  const done = (message: string) => {
    toast({ tone: "success", title: message });
    setStageTo(null);
    setReceivedOpen(false);
    setManualOpen(false);
    setCorrectDue(null);
    setEditing(null);
    setEditingDemand(null);
    router.refresh();
  };
  const fail = (message: string) =>
    toast({ tone: "danger", title: "Nothing changed", description: message });

  const showSource = (f: CaseFinding) => {
    setDocId(f.documentId);
    setActiveFinding(f.id);
    setInspectorOpen(true);
  };

  async function confirm(f: CaseFinding) {
    const r = await confirmFinding(f.id);
    if (!r.ok) return fail(r.message);
    done(r.data.note ?? "Confirmed.");
  }
  async function dismiss(f: CaseFinding) {
    const r = await dismissFinding({ findingId: f.id });
    if (!r.ok) return fail(r.message);
    router.refresh();
    toast({
      title: "Dismissed",
      description: f.duty,
      action: {
        label: "Undo",
        altText: "Undo dismiss",
        onClick: () => void restoreFinding(f.id).then(() => router.refresh()),
      },
    });
  }

  /** Mark a duty done (or reopen it), with Undo in the toast, as on Deadlines (M3). */
  async function toggleDone(dl: { id: string; status: string }, duty: string) {
    const next = dl.status === "done" ? "open" : "done";
    const r = await setDeadlineStatus({ deadlineId: dl.id, status: next });
    if (!r.ok) return fail(r.message);
    router.refresh();
    toast({
      tone: "success",
      title: next === "done" ? `Marked done: ${duty}` : `Reopened: ${duty}`,
      action: {
        label: "Undo",
        altText: "Undo the last change",
        onClick: () =>
          void setDeadlineStatus({ deadlineId: dl.id, status: dl.status as "open" | "done" }).then(
            (back) => (back.ok ? router.refresh() : fail(back.message)),
          ),
      },
    });
  }

  const duties = data.findings.filter(
    (f) =>
      f.status !== "dismissed" && ["obligation", "deadline", "hearing", "amount"].includes(f.kind),
  );
  const reviewCount = duties.filter((f) => f.needsReview).length;
  const nextDue = [
    ...duties.flatMap((f) => (f.deadline && f.deadline.status === "open" ? [f.deadline] : [])),
    ...data.otherDeadlines.filter((d) => d.status === "open"),
  ].sort((a, b) => a.iso.localeCompare(b.iso))[0];
  const language = data.languages[0]
    ? (LANGUAGE[data.languages[0]] ?? data.languages[0].toUpperCase())
    : null;
  const ownerName = data.owner?.name;

  const header = (
    <NoticeHeader
      authority={data.authority}
      type={data.typeLabel}
      reference={data.reference}
      title={data.title}
      issuingOffice={data.issuingOffice}
      {...(data.amountMinor ? { amount: data.amountMinor } : {})}
      {...(data.sections.length ? { sections: data.sections } : {})}
      received={
        data.notice?.received
          ? `${data.notice.received}${data.notice.receivedAssumed ? " (assumed: confirm)" : ""}`
          : "Needs receipt date"
      }
      receivedCorrected={data.receivedHistory.length > 0}
      {...(data.can.editDeadlines && data.notice
        ? { onEditReceived: () => setReceivedOpen(true) }
        : {})}
      onShowReceivedHistory={() => setHistoryOpen(true)}
      client={
        data.client
          ? {
              name: data.client.name,
              ...(data.client.gstin ? { identifier: data.client.gstin } : {}),
              href: `/clients/${data.client.id}`,
            }
          : { name: "No client yet" }
      }
      {...(ownerName ? { owner: { name: ownerName } } : {})}
      stage={data.stage}
      {...(language
        ? {
            badges: (
              <LanguageIndicator
                language={language}
                size="sm"
                onShowOriginal={() => setShowOriginal(true)}
              />
            ),
          }
        : {})}
      actions={
        data.stage === "approval" ? (
          data.can.approve ? (
            <Button
              variant="primary"
              icon={ApprovalIcon}
              onClick={() =>
                void approveCase(data.id).then((r) =>
                  r.ok ? done("Reply approved.") : fail(r.message),
                )
              }
              disabled={Boolean(data.approvedBy)}
            >
              {data.approvedBy ? `Approved by ${data.approvedBy}` : "Approve reply"}
            </Button>
          ) : null
        ) : data.can.move && ["drafting", "gathering"].includes(data.stage) ? (
          <Button variant="primary" icon={ApprovalIcon} onClick={() => setStageTo("approval")}>
            Ask for approval
          </Button>
        ) : null
      }
    />
  );

  const banner =
    data.stage === "approval" && !data.approvedBy ? (
      <Banner tone="info" title="Waiting for partner approval.">
        {data.approvalRequestedBy ? `${data.approvalRequestedBy.name} asked. ` : ""}
        {data.can.approve
          ? "You can approve this reply."
          : "Someone else who may approve replies must give it."}
      </Banner>
    ) : reviewCount ? (
      <Banner
        tone="warning"
        title={`${reviewCount} finding${reviewCount === 1 ? "" : "s"} to review.`}
      >
        Confirm, correct or dismiss each one before relying on it.
      </Banner>
    ) : nextDue &&
      (nextDue.state === "overdue" || nextDue.state === "today" || nextDue.state === "week") ? (
      <Banner
        tone={nextDue.state === "overdue" ? "danger" : "info"}
        title={`${nextDue.state === "overdue" ? "Overdue since" : "Next due"} ${nextDue.date}.`}
      >
        {nextDue.basis}
      </Banner>
    ) : undefined;

  const dutiesTab = (
    <div className={styles.stack}>
      <Card
        title={
          <span className={styles.row}>
            Summary
            {data.summary ? <OriginBadge origin={data.summary.origin as "rule"} size="sm" /> : null}
          </span>
        }
        headingLevel={2}
        padding="md"
        variant="outline"
      >
        {data.summary ? (
          <p className={styles.lead} dir="auto">
            {showOriginal ? data.summary.original : data.summary.text}
          </p>
        ) : (
          <p className={styles.small}>
            No summary yet. {data.title}
            {data.issuingOffice ? ` · ${data.issuingOffice}` : ""}.
          </p>
        )}
      </Card>
      {language ? (
        <LanguageIndicator
          language={language}
          detail={showOriginal ? "Showing the original" : "Machine translation"}
          onShowOriginal={() => setShowOriginal((s) => !s)}
        />
      ) : null}
      {duties.length === 0 ? (
        <EmptyState
          icon={CalendarStatutoryIcon}
          size="compact"
          headingLevel={3}
          title="No deadline found"
          description="Nothing on the pages said what must happen. Add a deadline by hand if there is one."
          {...(data.can.editDeadlines
            ? {
                actions: (
                  <Button icon={AddIcon} onClick={() => setManualOpen(true)}>
                    Add deadline
                  </Button>
                ),
              }
            : {})}
        />
      ) : null}
      {duties.map((f) => {
        const dl = f.deadline;
        return (
          <FindingCard
            key={f.id}
            duty={showOriginal ? f.original : f.duty}
            {...(f.deadline ? { due: { state: f.deadline.state, date: f.deadline.date } } : {})}
            {...(f.deadline
              ? {
                  basis: f.deadline.receivedAssumed
                    ? `${f.deadline.basis} · Received date assumed: confirm`
                    : f.deadline.basis,
                }
              : f.amountMinor
                ? { basis: <Amount minor={f.amountMinor} /> }
                : {})}
            {...(f.deadline?.windowEnd
              ? {
                  condonation: {
                    date: f.deadline.windowEnd,
                    ...(f.deadline.windowBasis ? { basis: f.deadline.windowBasis } : {}),
                  },
                }
              : {})}
            {...(f.owner || ownerName ? { owner: { name: f.owner ?? ownerName ?? "" } } : {})}
            status={
              f.deadline?.status === "done"
                ? { label: "Done", tone: "success" }
                : f.edited
                  ? { label: "Corrected", tone: "info" }
                  : { label: "Open", tone: "neutral" }
            }
            origin={f.origin}
            verification={
              f.grade === "unlocated"
                ? { state: "suggested" }
                : { state: "verified", ...(f.page ? { page: f.page } : {}) }
            }
            grade={f.grade}
            quote={f.quote}
            sourceLabel={f.page ? `Page ${f.page}` : "Not on the page"}
            onShowSource={() => showSource(f)}
            selected={inspectorOpen && activeFinding === f.id}
            needsReview={f.needsReview}
            {...(f.reviewReason ? { reviewReason: f.reviewReason } : {})}
            {...(f.needsReview && data.can.review
              ? {
                  onConfirm: () => void confirm(f),
                  onEdit: () =>
                    setEditing({
                      id: f.id,
                      duty: f.duty,
                      dueIso: f.deadline?.iso ?? null,
                      amountMinor: f.amountMinor,
                      kind: f.kind,
                    }),
                  onDismiss: () => void dismiss(f),
                }
              : {})}
            actions={
              data.can.editDeadlines || data.can.review ? (
                <span className={styles.row}>
                  {dl && data.can.editDeadlines ? (
                    <Button
                      size="sm"
                      variant={dl.status === "done" ? "plain" : "secondary"}
                      icon={dl.status === "done" ? UndoIcon : DoneIcon}
                      onClick={() => void toggleDone(dl, f.duty)}
                    >
                      {dl.status === "done" ? "Reopen" : "Mark done"}
                    </Button>
                  ) : null}
                  <Menu>
                    <MenuTrigger>
                      <IconButton
                        icon={MoreIcon}
                        label={`More for ${f.duty}`}
                        size="sm"
                        variant="ghost"
                      />
                    </MenuTrigger>
                    <MenuContent align="end">
                      {dl && data.can.editDeadlines ? (
                        <>
                          <MenuItem
                            icon={EditIcon}
                            onSelect={() =>
                              setCorrectDue({
                                deadlineId: dl.id,
                                title: f.duty,
                                iso: dl.iso,
                              })
                            }
                          >
                            Correct due date
                          </MenuItem>
                        </>
                      ) : null}
                      {data.can.review ? (
                        <MenuItem
                          onSelect={() =>
                            setEditing({
                              id: f.id,
                              duty: f.duty,
                              dueIso: f.deadline?.iso ?? null,
                              amountMinor: f.amountMinor,
                              kind: f.kind,
                            })
                          }
                        >
                          Correct the finding
                        </MenuItem>
                      ) : null}
                    </MenuContent>
                  </Menu>
                </span>
              ) : undefined
            }
          />
        );
      })}
      {data.otherDeadlines.length ? (
        <Card title="Other dates on this case" headingLevel={2} padding="md">
          <ul className={styles.list}>
            {data.otherDeadlines.map((d) => (
              <li key={d.id} className={styles.listItem}>
                <span className={styles.cellStack}>
                  <span className={styles.strong}>{d.title}</span>
                  <span className={styles.small}>
                    {d.basis}
                    {d.windowEnd ? ` · Condonation window to ${d.windowEnd} (a separate date)` : ""}
                  </span>
                </span>
                <DueChip state={d.state} detail={d.date} size="sm" />
                <StatusPill
                  label={
                    d.source === "order"
                      ? "From the order"
                      : d.source === "manual"
                        ? "Added by hand"
                        : d.source
                  }
                  tone="neutral"
                />
                {data.can.editDeadlines ? (
                  <IconButton
                    icon={EditIcon}
                    size="sm"
                    variant="ghost"
                    label={`Correct the date of ${d.title}`}
                    onClick={() => setCorrectDue({ deadlineId: d.id, title: d.title, iso: d.iso })}
                  />
                ) : (
                  <span />
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );

  const threadTab = (
    <div className={styles.stack}>
      <Timeline
        aria-label="Case thread"
        items={data.documents.map((d) => ({
          id: d.id,
          title: `${ROLE_WORD[d.role] ?? "Document"} · ${d.name}`,
          time: `${d.received || "Received date not set"} · ${d.pages} page${d.pages === 1 ? "" : "s"}`,
          icon: ROLE_ICON[d.role as keyof typeof ROLE_ICON] ?? DocumentIcon,
          tone: d.id === docId ? ("proof" as const) : ("neutral" as const),
          status: "complete" as const,
          meta: (
            <span className={styles.row}>
              {d.status !== "ready" ? (
                <StatusPill
                  label={d.status === "needs_review" ? "Needs review" : d.status.replace("_", " ")}
                  tone="warning"
                />
              ) : null}
              {d.role === "order" && !d.hasAppealWindow && data.can.editDeadlines ? (
                <Button
                  size="sm"
                  variant="tertiary"
                  onClick={() =>
                    void addAppealWindow({ caseId: data.id, documentId: d.id }).then((r) =>
                      r.ok ? done("Appeal window added.") : fail(r.message),
                    )
                  }
                >
                  Add appeal window
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="plain"
                onClick={() => {
                  setDocId(d.id);
                  setInspectorOpen(true);
                }}
              >
                Open
              </Button>
            </span>
          ),
        }))}
      />
      {data.can.upload ? (
        <Card title="Add to the thread" headingLevel={2} padding="md" variant="outline">
          <div className={styles.stack}>
            <Select
              label="This document is"
              value={uploadRole}
              onValueChange={(v) => setUploadRole(v as UploadRole)}
              options={[
                { value: "reply", label: "Our reply" },
                { value: "acknowledgement", label: "Acknowledgement (ARN)" },
                { value: "order", label: "Order" },
                { value: "appeal", label: "Appeal" },
                { value: "notice", label: "Another notice" },
                { value: "attachment", label: "Supporting paper" },
              ]}
            />
            <UploadPanel
              key={uploadRole}
              documentRole={uploadRole}
              caseId={data.id}
              size="md"
              title="Drop files for this case"
              description="They join the thread in order and are read like any page."
              onSettled={() => router.refresh()}
            />
          </div>
        </Card>
      ) : null}
    </div>
  );

  const demandTab = (
    <div className={styles.stack}>
      {data.demands.map((d) =>
        editingDemand?.id === d.id ? (
          <Card key={d.id} title="Change the demand" headingLevel={2} padding="md">
            <DemandForm
              data={data}
              demand={d}
              onDone={done}
              onCancel={() => setEditingDemand(null)}
            />
          </Card>
        ) : (
          <div key={d.id} className={styles.stackTight}>
            <Workings
              title={
                <span className={styles.row}>
                  {d.head === "tax" ? "Tax" : d.head} demanded:{" "}
                  <Amount minor={d.principalMinor} struck={d.status !== "open"} />
                  <StatusPill
                    label={d.status[0]?.toUpperCase() + d.status.slice(1)}
                    tone={d.status === "open" ? "warning" : "neutral"}
                  />
                </span>
              }
              steps={[
                {
                  id: "stated",
                  label: "As stated in the notice",
                  inputs: [
                    {
                      label: "Tax",
                      value: <Amount minor={d.principalMinor} />,
                      source: d.findingId ? "From the notice" : "Entered by hand",
                    },
                  ],
                  result: <Amount minor={d.principalMinor} />,
                },
                ...d.workings.map((w, i) => ({
                  id: `i${i}`,
                  label: w.label,
                  formula: w.formula,
                  inputs: Object.entries(w.inputs).map(([label, value]) => ({ label, value })),
                  result: w.result,
                })),
                ...(d.penalty
                  ? [
                      {
                        id: "penalty",
                        label: "Penalty, as a range",
                        inputs: d.penaltyWorkings.map((w) => ({
                          label: w.label,
                          value: `${w.formula} = ${w.result}`,
                        })),
                        result: <Amount minor={d.penalty.min} to={d.penalty.max} estimate />,
                      },
                    ]
                  : []),
              ]}
              {...(d.interestMinor !== null && d.asOf
                ? {
                    total: {
                      label: `Interest to ${d.asOf}`,
                      value: <Amount minor={d.interestMinor} size="lg" estimate />,
                    },
                  }
                : {})}
              {...(d.rateSource ? { rateSource: d.rateSource } : {})}
              {...(data.can.edit ? { onEditInputs: () => setEditingDemand(d) } : {})}
            />
            {d.warnings.map((w) => (
              <Banner key={w} tone="warning" variant="strip">
                {w}
              </Banner>
            ))}
          </div>
        ),
      )}
      {data.can.edit && (!data.demands.length || editingDemand?.id === undefined) ? (
        <Card
          title={data.demands.length ? "Add another demand" : "Enter the demand"}
          description="Tax, then the inputs for interest and penalty."
          headingLevel={2}
          padding="md"
        >
          <DemandForm data={data} demand={null} onDone={done} />
        </Card>
      ) : !data.demands.length ? (
        <EmptyState
          size="compact"
          title="No demand entered"
          description="Someone who can edit this case enters the amounts."
        />
      ) : null}
    </div>
  );

  const activityTab = (
    <ActivityFeed
      items={data.activity.map((a) => ({
        id: a.id,
        kind: a.kind,
        actor: { name: a.actor },
        at: a.at,
        time: a.time,
        ...(a.action ? { action: a.action } : {}),
        ...(a.change ? { change: a.change } : {}),
        ...(a.body ? { body: a.body } : {}),
        ...(a.reason ? { reason: a.reason } : {}),
      }))}
      composer={
        data.can.comment ? (
          <CommentComposer
            users={data.people.map((p) => ({ id: p.id, name: p.name, role: p.role }))}
            author={{ id: data.me.id, name: data.me.name }}
            placeholder="Write a note. Type @ to mention someone."
            onSubmit={async (c) => {
              const r = await addComment({
                caseId: data.id,
                text: c.text,
                mentionIds: c.mentionIds,
              });
              if (!r.ok) {
                fail(r.message);
                return;
              }
              router.refresh();
            }}
          />
        ) : undefined
      }
    />
  );

  const activeHighlight = proof?.highlights.some((h) => h.id === activeFinding)
    ? activeFinding
    : null;
  const activePage =
    proof?.highlights.find((h) => h.id === activeHighlight)?.page ?? initial.page ?? 1;
  return (
    <>
      <DetailPageTemplate
        title={
          [data.typeLabel.split(" · ")[0], data.reference].filter(Boolean).join(" · ") || data.title
        }
        toolbarLeading={
          <NextLink href="/notices" aria-label="Back to notices" className={styles.focusRing}>
            <ArrowLeftIcon label="Back to notices" />
          </NextLink>
        }
        breadcrumbs={
          <Breadcrumbs
            items={[
              { id: "notices", label: "Notices", href: "/notices" },
              ...(data.client
                ? [{ id: "client", label: data.client.name, href: `/clients/${data.client.id}` }]
                : []),
              { id: "case", label: data.reference ?? data.title },
            ]}
          />
        }
        actions={
          <>
            <Button icon={ProofIcon} onClick={() => setInspectorOpen(!inspectorOpen)}>
              {inspectorOpen ? "Hide page" : "Show page"}
            </Button>
            {data.can.assign ? (
              <Menu>
                <MenuTrigger>
                  <Button icon={UserIcon}>Assign</Button>
                </MenuTrigger>
                <MenuContent align="end">
                  {data.people.map((p) => (
                    <MenuItem
                      key={p.id}
                      onSelect={() =>
                        void assignCase({ caseId: data.id, ownerUserId: p.id }).then((r) =>
                          r.ok ? done(`Assigned to ${p.name}.`) : fail(r.message),
                        )
                      }
                    >
                      {p.name}
                      {p.id === data.owner?.id ? " (owner)" : ""}
                    </MenuItem>
                  ))}
                  <MenuSeparator />
                  <MenuItem
                    onSelect={() =>
                      void assignCase({ caseId: data.id, ownerUserId: null }).then((r) =>
                        r.ok ? done("Unassigned.") : fail(r.message),
                      )
                    }
                  >
                    Nobody
                  </MenuItem>
                </MenuContent>
              </Menu>
            ) : null}
            <Menu>
              <MenuTrigger>
                <IconButton icon={MoreIcon} label="More actions" />
              </MenuTrigger>
              <MenuContent align="end">
                <MenuItem
                  icon={PrintIcon}
                  onSelect={() => router.push(`/reports/evidence?case=${data.id}`)}
                >
                  Print evidence report
                </MenuItem>
                <MenuItem
                  icon={HearingPackIcon}
                  onSelect={() => router.push(`/reports/hearing-pack?case=${data.id}`)}
                >
                  Hearing pack
                </MenuItem>
                {data.can.editDeadlines ? (
                  <MenuItem icon={AddIcon} onSelect={() => setManualOpen(true)}>
                    Add a deadline by hand
                  </MenuItem>
                ) : null}
                {data.can.editDeadlines && data.notice ? (
                  <MenuItem icon={EditIcon} onSelect={() => setReceivedOpen(true)}>
                    Correct the received date
                  </MenuItem>
                ) : null}
                {data.can.move && data.stage !== "closed" ? (
                  <MenuItem onSelect={() => setStageTo("closed")}>Close the case</MenuItem>
                ) : null}
              </MenuContent>
            </Menu>
          </>
        }
        header={header}
        stageBar={
          <StageStepper
            current={data.stage}
            skipped={data.skipped}
            details={{
              ...data.stageDetails,
              ...(data.notice?.received
                ? { received: data.notice.received.replace(/ \d{4}$/, "") }
                : {}),
              ...(ownerName && data.stage === "drafting" ? { drafting: ownerName } : {}),
              ...(data.approvedBy ? { approval: `Approved · ${data.approvedBy}` } : {}),
              ...(data.filingRef ? { filed: `ARN ${data.filingRef}` } : {}),
            }}
            {...(data.can.move ? { onStageSelect: (s: string) => setStageTo(s) } : {})}
          />
        }
        banner={banner}
        activeTab={tab}
        onTabChange={setTab}
        tabs={[
          { id: "duties", label: "What must happen", count: duties.length, content: dutiesTab },
          { id: "thread", label: "Thread", count: data.documents.length, content: threadTab },
          {
            id: "demand",
            label: "Demand and interest",
            ...(data.demands.length ? { count: data.demands.length } : {}),
            content: demandTab,
          },
          { id: "activity", label: "Activity", count: data.activity.length, content: activityTab },
        ]}
        inspector={
          proof ? (
            <ProofViewer
              key={proof.documentId}
              title={proof.title}
              pages={proof.pages}
              highlights={proof.highlights}
              activeHighlightId={activeHighlight}
              onActiveHighlightChange={setActiveFinding}
              defaultPage={activePage}
              defaultZoom="fit-width"
              {...(language ? { languages: { original: language, translation: "English" } } : {})}
            />
          ) : proofError ? (
            <EmptyState
              size="compact"
              title="The page couldn't be loaded"
              description={proofError}
            />
          ) : docId ? (
            <Skeleton shape="rect" width="100%" height="100%" aria-label="Loading the page" />
          ) : (
            <EmptyState
              icon={AiSuggestedIcon}
              size="compact"
              title="No document yet"
              description="Add the notice to the thread."
            />
          )
        }
        inspectorTitle="The page"
        inspectorOpen={inspectorOpen}
        onInspectorOpenChange={setInspectorOpen}
      />
      <StageDialog data={data} to={stageTo} onClose={() => setStageTo(null)} onDone={done} />
      <ReceivedDialog
        data={data}
        open={receivedOpen}
        onClose={() => setReceivedOpen(false)}
        onDone={done}
      />
      <HistoryDialog data={data} open={historyOpen} onClose={() => setHistoryOpen(false)} />
      <ManualDeadlineDialog
        data={data}
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onDone={done}
      />
      <CorrectDueDialog target={correctDue} onClose={() => setCorrectDue(null)} onDone={done} />
      <EditFindingDialog finding={editing} onClose={() => setEditing(null)} onSaved={done} />
    </>
  );
}
