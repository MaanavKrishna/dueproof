"use client";
/** Record a demand as stated in a notice or order, with the rules for interest and the penalty range. */
import { Button, DatePicker, Dialog, MoneyField, Select } from "@dueproof/ui";
import { type FormEvent, useState } from "react";
import { type DemandInput, recordDemand } from "./actions";
import styles from "./clients.module.css";

export function DemandDialog({
  clientId,
  cases,
  onClose,
  onSaved,
}: {
  clientId: string;
  cases: { id: string; title: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [caseId, setCaseId] = useState(cases[0]?.id ?? "");
  const [taxType, setTaxType] = useState("gst");
  const [head, setHead] = useState<DemandInput["head"]>("tax");
  const [amount, setAmount] = useState<number | null>(null);
  const [interestRule, setInterestRule] = useState("in.gst.s50.1");
  const [dueOn, setDueOn] = useState<string | null>(null);
  const [penaltyRule, setPenaltyRule] = useState("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!amount) return setError("Enter the amount demanded.");
    setBusy(true);
    setError(null);
    const res = await recordDemand(clientId, {
      caseId,
      taxType,
      head,
      principalMinor: amount,
      interestRule: head === "tax" && interestRule !== "none" ? interestRule : null,
      dueOn: head === "tax" && interestRule !== "none" ? dueOn : null,
      penaltyRule: head === "tax" && penaltyRule !== "none" ? penaltyRule : null,
    });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    onClose();
    onSaved();
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Record a demand"
      description="As stated in the notice or order. Interest and the penalty range are estimates from these inputs, not advice."
      size="md"
    >
      <form className={styles.form} onSubmit={submit} noValidate>
        <Select
          label="Case"
          value={caseId}
          onValueChange={setCaseId}
          options={cases.map((c) => ({ value: c.id, label: c.title }))}
        />
        <div className={styles.grid2}>
          <Select
            label="Tax"
            value={taxType}
            onValueChange={(v) => {
              setTaxType(v);
              setInterestRule(
                v === "gst" ? "in.gst.s50.1" : v === "income_tax" ? "in.it.s234a" : "none",
              );
            }}
            options={[
              { value: "gst", label: "GST" },
              { value: "income_tax", label: "Income tax" },
              { value: "tds", label: "TDS" },
            ]}
          />
          <Select
            label="Head"
            value={head}
            onValueChange={(v) => setHead(v as DemandInput["head"])}
            options={[
              { value: "tax", label: "Tax" },
              { value: "interest", label: "Interest (as stated)" },
              { value: "penalty", label: "Penalty (as stated)" },
              { value: "fee", label: "Late fee" },
            ]}
          />
        </div>
        <MoneyField label="Amount demanded" value={amount} onValueChange={setAmount} />
        {head === "tax" ? (
          <>
            <Select
              label="Interest"
              value={interestRule}
              onValueChange={setInterestRule}
              options={[
                { value: "in.gst.s50.1", label: "GST s.50(1): tax paid late" },
                { value: "in.gst.s50.3", label: "GST s.50(3): ITC wrongly used" },
                { value: "in.it.s234a", label: "Income tax s.234A: late return" },
                { value: "none", label: "Don't compute" },
              ]}
            />
            {interestRule !== "none" ? (
              <DatePicker
                label="Tax fell due on"
                value={dueOn}
                onValueChange={setDueOn}
                description="Interest runs from the next day."
              />
            ) : null}
            <Select
              label="Penalty range"
              value={penaltyRule}
              onValueChange={setPenaltyRule}
              options={[
                { value: "none", label: "Not cited" },
                { value: "in.gst.s73", label: "GST s.73 (non-fraud)" },
                { value: "in.gst.s74", label: "GST s.74 (fraud)" },
                { value: "in.gst.s74a.non_fraud", label: "GST s.74A (non-fraud)" },
                { value: "in.gst.s125", label: "GST s.125 (general)" },
                { value: "in.it.s270a", label: "Income tax s.270A" },
                { value: "in.it.s271_1c", label: "Income tax s.271(1)(c)" },
              ]}
            />
          </>
        ) : null}
        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
        <div className={styles.formActions}>
          <Button type="button" variant="plain" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            Record demand
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
