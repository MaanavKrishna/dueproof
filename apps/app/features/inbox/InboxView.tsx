"use client";
import { CaseIcon, DoneIcon, KeyboardIcon, LinkIcon, NoticeIcon, ProofIcon } from "@dueproof/icons";
import {
  Amount,
  Banner,
  Button,
  Card,
  Combobox,
  DatePicker,
  Dialog,
  EmptyState,
  FindingCard,
  isTypingTarget,
  Kbd,
  ListPageTemplate,
  ProofViewer,
  Skeleton,
  StatusPill,
  TextField,
  useToast,
} from "@dueproof/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { confirmFinding, dismissFinding, restoreFinding } from "@/app/actions/findings";
import { setReceivedDate } from "@/app/actions/upload";
import { type EditableFinding, EditFindingDialog } from "@/components/EditFindingDialog";
import styles from "@/components/screen.module.css";
import { UploadPanel } from "@/components/UploadPanel";
import { useProof } from "@/components/useProof";
import { stageOf } from "@/components/useUploads";
import { fileInCase, openCase } from "./actions";
import type { FileItem, InboxData, ReviewItem } from "./queries";

/** "Received date assumed: confirm": keep the upload day, or set the day it arrived. */
function ReceivedDateCard({
  item,
  today,
  canEdit,
}: {
  item: ReviewItem;
  today: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [date, setDate] = useState<string | null>(item.received?.iso ?? null);
  const [busy, setBusy] = useState(false);
  const same = date === item.received?.iso;

  async function save() {
    if (!date) return;
    setBusy(true);
    const r = await setReceivedDate({ documentId: item.documentId, receivedOn: date });
    setBusy(false);
    if (!r.ok) return toast({ tone: "danger", title: "Not saved", description: r.message });
    toast({
      tone: "success",
      title: same ? "Received date confirmed" : "Received date set",
      description:
        r.data.recomputed > 0
          ? `${r.data.recomputed} due date${r.data.recomputed === 1 ? "" : "s"} recomputed.`
          : undefined,
    });
    router.refresh();
  }

  return (
    <Card
      padding="md"
      variant="outline"
      title={item.duty}
      description={`${item.client ?? "No client yet"} · ${item.documentName}`}
      headingLevel={3}
    >
      <div className={styles.stackTight}>
        <p className={styles.small}>{item.reason}</p>
        {canEdit ? (
          <div className={styles.row}>
            <DatePicker
              label={`Received on, ${item.documentName}`}
              hideLabel
              value={date}
              onValueChange={setDate}
              max={today}
              today={today}
              size="sm"
            />
            <Button size="sm" variant="primary" loading={busy} onClick={() => void save()}>
              {same ? "Confirm received date" : "Set received date"}
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function ReviewQueue({
  items,
  activeId,
  onActive,
  onEdit,
  canReview,
  today,
}: {
  items: ReviewItem[];
  activeId: string | null;
  onActive: (id: string | null) => void;
  onEdit: (f: EditableFinding) => void;
  canReview: boolean;
  today: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const refs = useRef(new Map<string, HTMLLIElement>());
  const [busy, setBusy] = useState<string | null>(null);
  const index = Math.max(
    0,
    items.findIndex((i) => i.id === activeId),
  );

  const focus = (i: number) => {
    const item = items[Math.min(Math.max(i, 0), items.length - 1)];
    if (!item) return;
    onActive(item.id);
    refs.current.get(item.id)?.focus();
  };

  async function confirm(item: ReviewItem) {
    if (item.kind !== "finding") return;
    setBusy(item.id);
    const r = await confirmFinding(item.id);
    setBusy(null);
    if (!r.ok) return toast({ tone: "danger", title: "Not confirmed", description: r.message });
    toast({
      tone: "success",
      title: "Confirmed",
      description: r.data.note ?? (r.data.dueOn ? "The deadline is set." : undefined),
    });
    focus(index + 1);
    router.refresh();
  }

  async function dismiss(item: ReviewItem) {
    if (item.kind !== "finding") return;
    setBusy(item.id);
    const r = await dismissFinding({ findingId: item.id });
    setBusy(null);
    if (!r.ok) return toast({ tone: "danger", title: "Not dismissed", description: r.message });
    toast({
      title: "Dismissed",
      description: item.duty,
      action: {
        label: "Undo",
        altText: "Undo dismiss",
        onClick: () => void restoreFinding(item.id).then(() => router.refresh()),
      },
    });
    focus(index + 1);
    router.refresh();
  }

  function onKeyDown(e: KeyboardEvent<HTMLOListElement>) {
    if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    const item = items[index];
    switch (e.key.toLowerCase()) {
      case "j":
      case "arrowdown":
        e.preventDefault();
        focus(index + 1);
        break;
      case "k":
      case "arrowup":
        e.preventDefault();
        focus(index - 1);
        break;
      case "enter":
        if (item && canReview && e.target === refs.current.get(item.id)) {
          e.preventDefault();
          void confirm(item);
        }
        break;
      case "e":
        if (item?.kind === "finding" && canReview) {
          e.preventDefault();
          onEdit({
            id: item.id,
            duty: item.duty,
            dueIso: item.due?.iso ?? null,
            amountMinor: item.amountMinor,
          });
        }
        break;
      case "x":
        if (item && canReview) {
          e.preventDefault();
          void dismiss(item);
        }
        break;
    }
  }

  if (!items.length) {
    return (
      <EmptyState
        icon={DoneIcon}
        size="compact"
        headingLevel={3}
        title="Nothing waits for review"
        description="Findings that need a person (not on the page, suggested by AI, or a date to confirm) appear here."
      />
    );
  }

  return (
    <ol
      className={`${styles.list} ${styles.stackTight}`}
      aria-label="Needs review"
      aria-keyshortcuts="J K Enter E X"
      onKeyDown={onKeyDown}
    >
      {items.map((item) => (
        <li
          key={item.id}
          tabIndex={item.id === (activeId ?? items[0]?.id) ? 0 : -1}
          className={styles.reviewItem}
          ref={(el) => {
            if (el) refs.current.set(item.id, el);
            else refs.current.delete(item.id);
          }}
          onFocus={() => onActive(item.id)}
          aria-busy={busy === item.id}
        >
          {item.kind === "received_date" ? (
            <ReceivedDateCard item={item} today={today} canEdit={canReview} />
          ) : item.kind === "nothing_found" ? (
            <Card
              padding="md"
              variant="outline"
              title={item.duty}
              description={`${item.client ?? "No client yet"} · ${item.documentName}`}
              headingLevel={3}
              actions={
                <Button
                  size="sm"
                  variant="secondary"
                  icon={ProofIcon}
                  onClick={() => onActive(item.id)}
                >
                  Show the page
                </Button>
              }
            >
              <p className={styles.small}>{item.reason}</p>
            </Card>
          ) : (
            <FindingCard
              duty={item.duty}
              {...(item.due ? { due: { state: item.due.state, date: item.due.date } } : {})}
              basis={
                <>
                  {item.client ?? "No client yet"} · {item.documentName}
                  {item.basis ? ` · ${item.basis}` : ""}
                  {item.amountMinor ? (
                    <>
                      {" · "}
                      <Amount minor={item.amountMinor} />
                    </>
                  ) : null}
                </>
              }
              origin={item.origin}
              verification={
                item.grade === "unlocated"
                  ? { state: "suggested" }
                  : { state: "verified", ...(item.page ? { page: item.page } : {}) }
              }
              grade={item.grade}
              {...(item.quote ? { quote: item.quote } : {})}
              sourceLabel={item.page ? `Page ${item.page}` : "Not on the page"}
              onShowSource={() => onActive(item.id)}
              selected={item.id === activeId}
              needsReview
              reviewReason={
                item.conflict ? (
                  <>
                    {item.reason}
                    <dl className={styles.conflict} aria-label="The two readings">
                      <dt>Rules read</dt>
                      <dd>{item.conflict.rule}</dd>
                      <dt>AI read</dt>
                      <dd>{item.conflict.ai}</dd>
                    </dl>
                  </>
                ) : (
                  item.reason
                )
              }
              {...(canReview && item.kind === "finding"
                ? {
                    onConfirm: () => void confirm(item),
                    onEdit: () =>
                      onEdit({
                        id: item.id,
                        duty: item.duty,
                        dueIso: item.due?.iso ?? null,
                        amountMinor: item.amountMinor,
                      }),
                    onDismiss: () => void dismiss(item),
                  }
                : {})}
            />
          )}
        </li>
      ))}
    </ol>
  );
}

function OpenCaseDialog({
  item,
  data,
  onClose,
}: {
  item: FileItem | null;
  data: InboxData;
  onClose: () => void;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [gstin, setGstin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setClientId(item?.client?.id ?? null);
    setNewName("");
    setGstin("");
    setError(null);
  }, [item]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!item) return;
    setBusy(true);
    const r = await openCase({
      documentId: item.id,
      ...(clientId ? { clientId } : {}),
      ...(!clientId && newName.trim() ? { newClientName: newName.trim() } : {}),
      ...(!clientId && newName.trim() && gstin.trim() ? { newClientGstin: gstin.trim() } : {}),
    });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    onClose();
    router.push(`/cases/${r.data.caseId}`);
  }

  return (
    <Dialog
      open={item !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Open a case"
      description={item ? `${item.name}${item.reference ? ` · ${item.reference}` : ""}` : undefined}
      size="md"
    >
      <form className={styles.stack} onSubmit={submit}>
        <Combobox
          label="Client"
          optional
          options={data.clients.map((c) => ({
            value: c.id,
            label: c.name,
            ...(c.gstin ? { description: c.gstin } : {}),
          }))}
          value={clientId}
          onValueChange={setClientId}
          placeholder="Search clients"
          emptyText="No client by that name. Add a new one below."
        />
        {!clientId ? (
          <div className={styles.formGrid}>
            <TextField
              label="New client"
              optional
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Harbour Valley Foods Pvt Ltd"
            />
            <TextField
              label="GSTIN"
              optional
              value={gstin}
              onChange={(e) => setGstin(e.target.value)}
              placeholder="27AAACH1234F1Z5"
              {...(error ? { error } : {})}
            />
          </div>
        ) : error ? (
          <Banner tone="danger">{error}</Banner>
        ) : null}
        <div className={styles.row}>
          <Button type="submit" variant="primary" icon={CaseIcon} loading={busy}>
            Open case
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function InboxView({
  data,
  canReview,
  canFile,
}: {
  data: InboxData;
  canReview: boolean;
  canFile: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [editing, setEditing] = useState<EditableFinding | null>(null);
  const [opening, setOpening] = useState<FileItem | null>(null);
  const active = data.review.find((r) => r.id === activeId) ?? null;
  const { proof, error } = useProof(inspectorOpen ? active?.documentId : null);

  const onActive = (id: string | null) => {
    setActiveId(id);
    if (id) setInspectorOpen(true);
  };

  async function fileSuggested(item: FileItem) {
    if (!item.suggestedCase) return;
    const r = await fileInCase({ documentId: item.id, caseId: item.suggestedCase.id });
    if (!r.ok) return toast({ tone: "danger", title: "Not filed", description: r.message });
    toast({
      tone: "success",
      title: "Filed in the case",
      description: item.suggestedCase.reference ?? item.suggestedCase.title,
    });
    router.refresh();
  }

  const findingCount = data.review.length;
  return (
    <ListPageTemplate
      title="Inbox"
      subtitle={`${findingCount} to review · ${data.toFile.length} to file in a case`}
      scrollPage
      inspector={
        active ? (
          <div className={styles.inspector}>
            {proof ? (
              <div className={styles.proofFill}>
                <ProofViewer
                  title={proof.title}
                  pages={proof.pages}
                  highlights={proof.highlights}
                  activeHighlightId={active.kind === "finding" ? active.id : null}
                  onActiveHighlightChange={(id) => {
                    if (id && data.review.some((r) => r.id === id)) setActiveId(id);
                  }}
                  defaultPage={active.page ?? 1}
                  defaultZoom="fit-width"
                  pageStrip={false}
                />
              </div>
            ) : error ? (
              <EmptyState size="compact" title="The page couldn't be loaded" description={error} />
            ) : (
              <Skeleton shape="rect" width="100%" height="100%" aria-label="Loading the page" />
            )}
          </div>
        ) : undefined
      }
      inspectorTitle={active ? active.documentName : "The page"}
      inspectorOpen={inspectorOpen && active !== null}
      onInspectorOpenChange={setInspectorOpen}
    >
      <div className={styles.content}>
        <section className={styles.stack} aria-labelledby="inbox-upload">
          <h2 id="inbox-upload" className={styles.sectionTitle}>
            Upload
          </h2>
          <UploadPanel
            size={data.review.length || data.toFile.length ? "md" : "lg"}
            initial={data.processing.map((p) => ({
              id: p.id,
              documentId: p.documentId,
              name: p.name,
              size: p.size,
              stage: stageOf(p.status),
            }))}
            onSettled={() => router.refresh()}
            onOpen={(documentId) => {
              // Its findings to review, else the next step for it here (filing
              // it in a case), else wherever it is filed (a duplicate, say).
              const review = data.review.find((r) => r.documentId === documentId);
              if (review) return onActive(review.id);
              const unfiled = data.toFile.find((d) => d.id === documentId);
              if (unfiled && canFile) return setOpening(unfiled);
              router.push(`/notices/${encodeURIComponent(documentId)}`);
            }}
          />
        </section>

        <section className={styles.stack} aria-labelledby="inbox-review">
          <div className={styles.spread}>
            <h2 id="inbox-review" className={styles.sectionTitle}>
              Needs review <span className={styles.muted}>{findingCount}</span>
            </h2>
            {findingCount ? (
              <span className={`${styles.row} ${styles.small}`}>
                <KeyboardIcon />
                <Kbd>J</Kbd>/<Kbd>K</Kbd> move · <Kbd>Enter</Kbd> confirm · <Kbd>E</Kbd> edit ·{" "}
                <Kbd>X</Kbd> dismiss
              </span>
            ) : null}
          </div>
          {!canReview && findingCount ? (
            <Banner tone="info">
              You can read these. Someone with review access confirms them.
            </Banner>
          ) : null}
          <ReviewQueue
            items={data.review}
            activeId={activeId}
            onActive={onActive}
            onEdit={setEditing}
            canReview={canReview}
            today={data.today}
          />
        </section>

        <section className={styles.stack} aria-labelledby="inbox-file">
          <h2 id="inbox-file" className={styles.sectionTitle}>
            To file in a case <span className={styles.muted}>{data.toFile.length}</span>
          </h2>
          {data.toFile.length ? (
            <Card padding="md">
              <ul className={styles.list} aria-label="To file in a case">
                {data.toFile.map((d) => (
                  <li key={d.id} className={styles.listItem}>
                    <span className={styles.cellStack}>
                      <span className={`${styles.ellipsis} ${styles.strong}`}>
                        <NoticeIcon /> {d.name}
                      </span>
                      <span className={styles.small}>
                        {d.client?.name ?? "Client not matched"}
                        {d.reference ? ` · ${d.reference}` : ""} · received {d.received}
                        {d.receivedAssumed ? " (assumed: confirm)" : ""}
                      </span>
                    </span>
                    <StatusPill
                      label={d.status === "ready" ? "Read" : "Needs review"}
                      tone={d.status === "ready" ? "success" : "warning"}
                    />
                    {d.suggestedCase && canFile ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={LinkIcon}
                        onClick={() => void fileSuggested(d)}
                      >
                        Add to {d.suggestedCase.reference ?? "case"}
                      </Button>
                    ) : (
                      <span />
                    )}
                    {canFile ? (
                      <Button
                        size="sm"
                        variant="tertiary"
                        icon={CaseIcon}
                        onClick={() => setOpening(d)}
                      >
                        Open case
                      </Button>
                    ) : (
                      <span />
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <EmptyState
              icon={ProofIcon}
              size="compact"
              headingLevel={3}
              title="Everything is filed"
              description="Documents that aren't in a case yet appear here."
            />
          )}
        </section>
      </div>
      <EditFindingDialog
        finding={editing}
        onClose={() => setEditing(null)}
        onSaved={(message) => {
          setEditing(null);
          toast({ tone: "success", title: message });
          router.refresh();
        }}
      />
      <OpenCaseDialog item={opening} data={data} onClose={() => setOpening(null)} />
    </ListPageTemplate>
  );
}
