"use client";
/**
 * Correct a finding: what must happen, the date read on the page, the
 * amount. The original stays beside the correction (finding_edits); a
 * reason is required.
 */
import { Button, DatePicker, Dialog, MoneyField, TextArea, TextField } from "@dueproof/ui";
import { type FormEvent, useEffect, useState } from "react";
import { editFinding } from "@/app/actions/findings";
import styles from "./screen.module.css";

export interface EditableFinding {
  id: string;
  duty: string;
  dueIso?: string | null;
  amountMinor?: number | null;
  kind?: string;
}

export function EditFindingDialog({
  finding,
  onClose,
  onSaved,
}: {
  finding: EditableFinding | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [duty, setDuty] = useState("");
  const [due, setDue] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!finding) return;
    setDuty(finding.duty);
    setDue(finding.dueIso ?? null);
    setAmount(finding.amountMinor ?? null);
    setNote("");
    setError(null);
  }, [finding]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!finding) return;
    setBusy(true);
    const r = await editFinding({
      findingId: finding.id,
      ...(duty !== finding.duty ? { text: duty } : {}),
      ...(due && due !== (finding.dueIso ?? null) ? { dueOn: due } : {}),
      ...(amount !== null && amount !== (finding.amountMinor ?? null)
        ? { amountMinor: amount }
        : {}),
      note,
    });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    onSaved(
      r.data.note ??
        (r.data.dueOn
          ? "Corrected and confirmed. The deadline is set."
          : "Corrected and confirmed."),
    );
  }

  return (
    <Dialog
      open={finding !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Correct this finding"
      description="Your correction is kept beside what was found, with your reason."
      size="md"
      dismissible={false}
    >
      <form className={styles.stack} onSubmit={submit}>
        <TextField
          label="What must happen"
          value={duty}
          onChange={(e) => setDuty(e.target.value)}
        />
        <DatePicker
          label="Due date, as written on the page"
          optional
          value={due}
          onValueChange={setDue}
          description="Leave empty to keep the computed date."
        />
        {finding?.kind === "amount" || finding?.amountMinor ? (
          <MoneyField label="Amount" optional value={amount} onValueChange={setAmount} />
        ) : null}
        <TextArea
          label="Reason"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="For example: the notice says 30 days from service, not receipt."
          {...(error ? { error } : {})}
        />
        <div className={styles.row}>
          <Button type="submit" variant="primary" loading={busy}>
            Save and confirm
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
