"use client";
/**
 * Add or edit a registration: kind, number, state, frequency, scheme, and
 * the facts the statutory calendar needs (tax audit, transfer pricing,
 * advance tax, 24Q/26Q, company type, AGM date). Saving rebuilds the
 * client's statutory deadlines.
 */
import { checkCin, checkGstin, checkPan, checkTan } from "@dueproof/core/identifiers";
import { Button, Checkbox, DatePicker, Dialog, Select, TextField } from "@dueproof/ui";
import { type FormEvent, useState } from "react";
import { type RegistrationInput, saveRegistration } from "./actions";
import styles from "./clients.module.css";
import type { RegistrationRow } from "./queries";

type Kind = RegistrationInput["kind"];
const CHECK: Record<Kind, typeof checkPan | null> = {
  gst: checkGstin,
  tds: checkTan,
  income_tax: checkPan,
  roc: checkCin,
  other: null,
};
const NUMBER_LABEL: Record<Kind, string> = {
  gst: "GSTIN",
  tds: "TAN",
  income_tax: "PAN",
  roc: "CIN",
  other: "Number",
};

export function RegistrationDialog({
  clientId,
  initial,
  suggestion,
  onClose,
  onSaved,
}: {
  clientId: string;
  initial: RegistrationRow | null;
  suggestion: { gstin: string; pan: string; tan: string; cin: string };
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const a = (initial?.attributes ?? {}) as Record<string, unknown>;
  const events = (a.events ?? {}) as Record<string, { agm?: string }>;
  const firstAgm = Object.values(events).find((e) => e.agm)?.agm ?? null;
  const [kind, setKind] = useState<Kind>(initial?.kind ?? "gst");
  const [identifier, setIdentifier] = useState(initial?.identifier ?? suggestion.gstin);
  const [frequency, setFrequency] = useState<string>(initial?.frequency ?? "monthly");
  const [scheme, setScheme] = useState<string>(initial?.scheme ?? "regular");
  const [audit, setAudit] = useState(a.audit === true);
  const [tp, setTp] = useState(a.transferPricing === true);
  const [advanceTax, setAdvanceTax] = useState<string>(
    typeof a.advanceTax === "string" ? a.advanceTax : "regular",
  );
  const [files24Q, setFiles24Q] = useState(a.files24Q !== false);
  const [files26Q, setFiles26Q] = useState(a.files26Q !== false);
  const [companyType, setCompanyType] = useState<string>(
    typeof a.companyType === "string" ? a.companyType : "private",
  );
  const [agmOn, setAgmOn] = useState<string | null>(firstAgm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = CHECK[kind];
  const idError = identifier.trim() && check ? check(identifier).reason : undefined;

  function changeKind(k: Kind) {
    setKind(k);
    if (!initial)
      setIdentifier(
        {
          gst: suggestion.gstin,
          tds: suggestion.tan,
          income_tax: suggestion.pan,
          roc: suggestion.cin,
          other: "",
        }[k],
      );
    setFrequency(k === "gst" ? "monthly" : k === "tds" ? "quarterly" : "annual");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const attributes: Record<string, string | boolean> = {};
    if (kind === "income_tax")
      Object.assign(attributes, { audit, transferPricing: tp, advanceTax });
    if (kind === "tds") Object.assign(attributes, { files24Q, files26Q });
    if (kind === "roc") attributes.companyType = companyType;
    setBusy(true);
    const res = await saveRegistration(clientId, {
      ...(initial ? { id: initial.id } : {}),
      kind,
      identifier,
      frequency: frequency as "monthly" | "quarterly" | "annual",
      scheme: kind === "gst" ? scheme : null,
      attributes,
      agmOn: kind === "roc" ? agmOn : null,
    });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    onClose();
    onSaved(
      res.data.inserted || res.data.removed
        ? `Calendar rebuilt: ${res.data.inserted} added, ${res.data.removed} removed`
        : "Registration saved; calendar up to date",
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={initial ? "Edit registration" : "Add a registration"}
      description="The statutory calendar is built from this. Every rule is from the India pack and marked for a CA to check."
      size="md"
    >
      <form className={styles.form} onSubmit={submit} noValidate>
        <Select
          label="Kind"
          value={kind}
          onValueChange={(v) => changeKind(v as Kind)}
          disabled={Boolean(initial)}
          options={[
            { value: "gst", label: "GST (GSTIN)" },
            { value: "tds", label: "TDS (TAN)" },
            { value: "income_tax", label: "Income tax (PAN)" },
            { value: "roc", label: "Companies Act (CIN)" },
            { value: "other", label: "Other" },
          ]}
        />
        <TextField
          label={NUMBER_LABEL[kind]}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          error={idError}
          autoCapitalize="characters"
          required
        />
        {kind === "gst" ? (
          <div className={styles.grid2}>
            <Select
              label="Returns"
              value={frequency}
              onValueChange={(v) => {
                setFrequency(v);
                setScheme(v === "quarterly" ? "qrmp" : "regular");
              }}
              options={[
                { value: "monthly", label: "Monthly" },
                { value: "quarterly", label: "Quarterly (QRMP)" },
              ]}
            />
            <Select
              label="Scheme"
              value={scheme}
              onValueChange={setScheme}
              options={[
                { value: "regular", label: "Regular" },
                { value: "qrmp", label: "QRMP" },
                { value: "composition", label: "Composition" },
              ]}
            />
          </div>
        ) : null}
        {kind === "income_tax" ? (
          <>
            <Checkbox
              label="Tax audit (section 44AB)"
              checked={audit}
              onCheckedChange={(v) => setAudit(v === true)}
            />
            <Checkbox
              label="Transfer pricing report (section 92E)"
              checked={tp}
              onCheckedChange={(v) => setTp(v === true)}
            />
            <Select
              label="Advance tax"
              value={advanceTax}
              onValueChange={setAdvanceTax}
              options={[
                { value: "regular", label: "Four instalments" },
                { value: "presumptive", label: "One instalment (presumptive, 44AD/44ADA)" },
                { value: "none", label: "Not payable" },
              ]}
            />
          </>
        ) : null}
        {kind === "tds" ? (
          <>
            <Checkbox
              label="Files 24Q (salaries)"
              checked={files24Q}
              onCheckedChange={(v) => setFiles24Q(v === true)}
            />
            <Checkbox
              label="Files 26Q (other payments)"
              checked={files26Q}
              onCheckedChange={(v) => setFiles26Q(v === true)}
            />
          </>
        ) : null}
        {kind === "roc" ? (
          <>
            <Select
              label="Company type"
              value={companyType}
              onValueChange={setCompanyType}
              options={[
                { value: "private", label: "Private limited" },
                { value: "public", label: "Public limited" },
                { value: "small", label: "Small company" },
                { value: "listed", label: "Listed" },
                { value: "opc", label: "One person company" },
              ]}
            />
            <DatePicker
              label="Last AGM date"
              optional
              description="AOC-4 and MGT-7 count from it. Without it, they count from 30 September."
              value={agmOn}
              onValueChange={setAgmOn}
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
            Save and rebuild calendar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
