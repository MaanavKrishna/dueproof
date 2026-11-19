"use client";
/** Dialogs on the case page: stage moves, received date, due-date correction, manual deadline, demand. */
import { FiledAckIcon } from "@dueproof/icons";
import {
  Amount,
  Banner,
  Button,
  DatePicker,
  Dialog,
  MoneyField,
  Select,
  TextArea,
  TextField,
} from "@dueproof/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import styles from "@/components/screen.module.css";
import { UploadPanel } from "@/components/UploadPanel";
import { INTEREST_RULES, PENALTY_RULES } from "@/lib/demands";
import {
  addManualDeadline,
  changeStage,
  correctDueDate,
  correctReceivedDate,
  saveDemand,
} from "./actions";
import type { CaseData, CaseDemand } from "./queries";

const STAGE_ORDER = [
  "received",
  "gathering",
  "drafting",
  "approval",
  "filed",
  "order",
  "appeal",
  "closed",
];
export const STAGE_WORDS: Record<string, string> = {
  received: "Received",
  gathering: "Documents gathered",
  drafting: "Draft reply",
  approval: "Partner approval",
  filed: "Filed on portal",
  order: "Order received",
  appeal: "Appeal",
  closed: "Closed",
};

function Actions({
  busy,
  label,
  onCancel,
}: {
  busy: boolean;
  label: string;
  onCancel: () => void;
}) {
  return (
    <div className={styles.row}>
      <Button type="submit" variant="primary" loading={busy}>
        {label}
      </Button>
      <Button type="button" variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

function useSubmit(onDone: (message: string) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<{ ok: boolean; message?: string }>, done: string) => {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return setError(r.message ?? "Something went wrong.");
    onDone(done);
  };
  return { busy, error, setError, run };
}

export function StageDialog({
  data,
  to,
  onClose,
  onDone,
}: {
  data: CaseData;
  to: string | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [arn, setArn] = useState("");
  const [filedOn, setFiledOn] = useState<string | null>(data.today);
  const { busy, error, setError, run } = useSubmit(onDone);
  useEffect(() => {
    setReason("");
    setArn(data.filingRef ?? "");
    setError(null);
  }, [data.filingRef, setError]);
  if (!to) return null;
  const skip = STAGE_ORDER.indexOf(to) !== STAGE_ORDER.indexOf(data.stage) + 1;
  const hasAck = data.documents.some((d) => d.role === "acknowledgement");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(
      () =>
        changeStage({
          caseId: data.id,
          to: to as "received",
          ...(reason.trim() ? { reason: reason.trim() } : {}),
          ...(to === "filed" ? { filingRef: arn, ...(filedOn ? { filedOn } : {}) } : {}),
        }),
      `Moved to ${STAGE_WORDS[to]}`,
    );
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={to === "approval" ? "Ask for partner approval" : `Move to ${STAGE_WORDS[to]}`}
      description={
        to === "approval"
          ? "A partner who may approve replies will see this case in Awaiting approval. You can't approve your own request."
          : to === "filed"
            ? "Dueproof never files anything. Record what you filed on the portal."
            : skip
              ? "This skips a stage or goes back, so it needs a reason. Every move is kept in the case's history."
              : "Every move is kept in the case's history."
      }
      size="md"
      dismissible={false}
    >
      <form className={styles.stack} onSubmit={submit}>
        {to === "filed" ? (
          <>
            <TextField
              label="Acknowledgement or ARN number"
              value={arn}
              onChange={(e) => setArn(e.target.value)}
              placeholder="AA270126012345X"
              className={styles.mono}
            />
            <DatePicker
              label="Filed on"
              value={filedOn}
              onValueChange={setFiledOn}
              max={data.today}
            />
            {hasAck ? (
              <Banner tone="success" icon={FiledAckIcon}>
                The acknowledgement is in the thread.
              </Banner>
            ) : (
              <div className={styles.stackTight}>
                <span className={styles.small}>
                  Upload the acknowledgement. It's read and outlined like any page.
                </span>
                <UploadPanel
                  documentRole="acknowledgement"
                  caseId={data.id}
                  size="md"
                  title="Drop the acknowledgement here"
                  description="PDF or a photo of the portal's acknowledgement."
                  onSettled={() => router.refresh()}
                />
              </div>
            )}
          </>
        ) : null}
        <TextArea
          label="Reason"
          optional={!skip}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={skip ? "For example: no reply needed, the notice was dropped." : undefined}
          {...(error ? { error } : {})}
        />
        <Actions
          busy={busy}
          label={to === "approval" ? "Ask for approval" : "Move stage"}
          onCancel={onClose}
        />
      </form>
    </Dialog>
  );
}

export function ReceivedDialog({
  data,
  open,
  onClose,
  onDone,
}: {
  data: CaseData;
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [date, setDate] = useState<string | null>(data.notice?.receivedIso ?? null);
  const [reason, setReason] = useState("");
  const { busy, error, run } = useSubmit(onDone);
  if (!data.notice) return null;
  const notice = data.notice;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Correct the received date"
      description="Due dates that run from receipt are computed again. The old date stays in the history."
      size="sm"
      dismissible={false}
    >
      <form
        className={styles.stack}
        onSubmit={(e) => {
          e.preventDefault();
          if (!date) return;
          void run(
            () =>
              correctReceivedDate({
                caseId: data.id,
                documentId: notice.id,
                receivedOn: date,
                reason,
              }),
            "Received date corrected. Due dates recomputed.",
          );
        }}
      >
        <DatePicker label="Received on" value={date} onValueChange={setDate} max={data.today} />
        <TextArea
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="For example: the envelope shows it arrived on 24 Oct."
          {...(error ? { error } : {})}
        />
        <Actions busy={busy} label="Correct date" onCancel={onClose} />
      </form>
    </Dialog>
  );
}

export function HistoryDialog({
  data,
  open,
  onClose,
}: {
  data: CaseData;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Received date history"
      size="sm"
    >
      {data.receivedHistory.length ? (
        <ul className={styles.list}>
          {data.receivedHistory.map((h) => (
            <li key={`${h.at}-${h.to}`} className={styles.stackTight}>
              <span>
                <s>{h.from}</s> → <strong>{h.to}</strong>
              </span>
              <span className={styles.small}>
                {h.by}, {h.at}: {h.reason}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.small}>Not corrected. The date is as entered at upload.</p>
      )}
    </Dialog>
  );
}

export function CorrectDueDialog({
  target,
  onClose,
  onDone,
}: {
  target: { deadlineId: string; title: string; iso: string } | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [date, setDate] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const { busy, error, run } = useSubmit(onDone);
  useEffect(() => {
    setDate(target?.iso ?? null);
    setReason("");
  }, [target]);
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(o) => !o && onClose()}
      title="Correct the due date"
      description={
        target
          ? `${target.title.replace(/[.\s]+$/, "")}. The computed date is kept beside your correction.`
          : undefined
      }
      size="sm"
      dismissible={false}
    >
      <form
        className={styles.stack}
        onSubmit={(e) => {
          e.preventDefault();
          if (!target || !date) return;
          void run(
            () => correctDueDate({ deadlineId: target.deadlineId, dueOn: date, reason }),
            "Due date corrected.",
          );
        }}
      >
        <DatePicker label="Due on" value={date} onValueChange={setDate} />
        <TextArea
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          {...(error ? { error } : {})}
        />
        <Actions busy={busy} label="Correct date" onCancel={onClose} />
      </form>
    </Dialog>
  );
}

export function ManualDeadlineDialog({
  data,
  open,
  onClose,
  onDone,
}: {
  data: CaseData;
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<string | null>(null);
  const { busy, error, run } = useSubmit(onDone);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Add a deadline by hand"
      size="sm"
      dismissible={false}
    >
      <form
        className={styles.stack}
        onSubmit={(e) => {
          e.preventDefault();
          if (!date) return;
          void run(
            () => addManualDeadline({ caseId: data.id, title, dueOn: date }),
            "Deadline added.",
          );
        }}
      >
        <TextField
          label="What is due"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Reply to the notice"
        />
        <DatePicker
          label="Due on"
          value={date}
          onValueChange={setDate}
          {...(error ? { error } : {})}
        />
        <Actions busy={busy} label="Add deadline" onCancel={onClose} />
      </form>
    </Dialog>
  );
}

export function DemandForm({
  data,
  demand,
  onDone,
  onCancel,
  fresh = false,
}: {
  data: CaseData;
  demand: Partial<CaseDemand> | null;
  onDone: (message: string) => void;
  onCancel?: () => void;
  /** Start empty: another demand, so the notice's amount isn't offered twice. */
  fresh?: boolean;
}) {
  const gst = data.authority === "gst";
  const [principal, setPrincipal] = useState<number | null>(
    demand?.principalMinor ?? (fresh ? null : (data.amountMinor ?? null)),
  );
  const [taxType, setTaxType] = useState<string>(demand?.taxType ?? (gst ? "gst" : "income_tax"));
  const [rule, setRule] = useState<string>(
    demand?.interestRule ?? (gst ? "in.gst.s50.1" : "in.it.s234a"),
  );
  const [penalty, setPenalty] = useState<string>(
    demand?.penaltyRule ?? (gst ? "in.gst.s73" : "none"),
  );
  const [status, setStatus] = useState<string>(demand?.status ?? "open");
  const [dueOn, setDueOn] = useState<string | null>(demand?.dueOn ?? null);
  const [asOf, setAsOf] = useState<string | null>(demand?.asOf ?? data.today);
  const { busy, error, run } = useSubmit(onDone);
  const fromNotice = !demand?.id && !fresh && data.amountMinor && principal === data.amountMinor;
  // Keep the link to the finding while the amount is the one read (M4): a
  // confirmed notice amount is "As stated in the notice", not "Entered by hand".
  const amountFinding = data.findings.find(
    (f) => f.kind === "amount" && f.amountMinor === data.amountMinor,
  );
  const findingId =
    demand?.findingId && principal === demand.principalMinor
      ? demand.findingId
      : fromNotice
        ? (amountFinding?.id ?? null)
        : null;
  let note: ReactNode = null;
  if (fromNotice && data.amountMinor) {
    note = (
      <span className={styles.small}>
        <Amount minor={data.amountMinor} /> as stated in the notice. Confirm it, or change it.
      </span>
    );
  }
  return (
    <form
      className={styles.stack}
      onSubmit={(e) => {
        e.preventDefault();
        if (!principal) return;
        void run(
          () =>
            saveDemand({
              caseId: data.id,
              ...(demand?.id ? { demandId: demand.id } : {}),
              taxType: taxType as "gst",
              status: status as "open",
              principalMinor: principal,
              ...(rule !== "none" ? { interestRule: rule } : {}),
              ...(penalty !== "none" ? { penaltyRule: penalty } : {}),
              ...(dueOn ? { dueOn } : {}),
              ...(asOf ? { asOf } : {}),
              ...(findingId ? { findingId } : {}),
            }),
          demand?.id ? "Demand updated." : "Demand saved.",
        );
      }}
    >
      <div className={styles.formGrid}>
        <MoneyField
          label="Tax demanded"
          value={principal}
          onValueChange={setPrincipal}
          description={note}
        />
        <Select
          label="Tax"
          value={taxType}
          onValueChange={setTaxType}
          options={[
            { value: "gst", label: "GST" },
            { value: "income_tax", label: "Income tax" },
            { value: "tds", label: "TDS" },
            { value: "other", label: "Other" },
          ]}
        />
        <Select
          label="Status"
          value={status}
          onValueChange={setStatus}
          options={[
            { value: "open", label: "Open" },
            { value: "paid", label: "Paid" },
            { value: "stayed", label: "Stayed" },
            { value: "dropped", label: "Dropped" },
          ]}
        />
      </div>
      <div className={styles.formGrid}>
        <Select
          label="Interest rule"
          value={rule}
          onValueChange={setRule}
          options={[
            { value: "none", label: "No interest" },
            ...INTEREST_RULES.map((r) => ({ value: r.key, label: r.label })),
          ]}
        />
        <DatePicker
          label="Tax was due on"
          optional={rule === "none"}
          value={dueOn}
          onValueChange={setDueOn}
          description="Interest runs from the next day."
        />
        <DatePicker
          label="Compute up to"
          value={asOf}
          onValueChange={setAsOf}
          description="The date paid, or today."
        />
      </div>
      <Select
        label="Penalty section"
        value={penalty}
        onValueChange={setPenalty}
        options={[
          { value: "none", label: "No penalty" },
          ...PENALTY_RULES.map((p) => ({ value: p.key, label: p.label })),
        ]}
        description="Shown as a range, lowest to highest, never one figure."
      />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <div className={styles.row}>
        <Button type="submit" variant="primary" loading={busy}>
          {demand?.id ? "Update" : fromNotice ? "Confirm demand" : "Save demand"}
        </Button>
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
      <p className={styles.small}>
        Interest and penalty are estimates from the stated inputs, not advice.
      </p>
    </form>
  );
}
