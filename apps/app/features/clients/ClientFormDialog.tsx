"use client";
/** New client, or edit one: name, identifiers (checked as you type), partner and tags. */
import { checkCin, checkGstin, checkPan, checkTan } from "@dueproof/core/identifiers";
import { Button, Dialog, Select, TextArea, TextField } from "@dueproof/ui";
import { type FormEvent, useState } from "react";
import { type ClientInput, createClient, updateClient } from "./actions";
import styles from "./clients.module.css";

const reasonOf = (v: string, fn: typeof checkPan) => {
  if (!v.trim()) return undefined;
  const r = fn(v);
  return r.ok ? undefined : r.reason;
};

export function ClientFormDialog({
  open,
  onOpenChange,
  people,
  onSaved,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  people: { id: string; name: string }[];
  onSaved: (id: string) => void;
  initial?: ClientInput & { id: string };
}) {
  const [v, setV] = useState({
    name: initial?.name ?? "",
    legalName: initial?.legalName ?? "",
    pan: initial?.pan ?? "",
    gstins: (initial?.gstins ?? []).join(", "),
    cin: initial?.cin ?? "",
    tan: initial?.tan ?? "",
    tags: (initial?.tags ?? []).join(", "),
    partnerUserId: initial?.partnerUserId ?? "none",
    notes: initial?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) =>
    setV({ ...v, [k]: e.target.value });
  const gstinError = v.gstins
    .split(/[,;\s]+/)
    .filter(Boolean)
    .map((g) => reasonOf(g, checkGstin))
    .find(Boolean);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const input: ClientInput = {
      name: v.name,
      legalName: v.legalName,
      pan: v.pan,
      gstins: v.gstins.split(/[,;\s]+/).filter(Boolean),
      cin: v.cin,
      tan: v.tan,
      tags: v.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      partnerUserId: v.partnerUserId === "none" ? null : v.partnerUserId,
      notes: v.notes,
    };
    const res = initial ? await updateClient(initial.id, input) : await createClient(input);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    onOpenChange(false);
    onSaved(initial?.id ?? (res.data as { id: string }).id);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit client" : "New client"}
      size="md"
    >
      <form className={styles.form} onSubmit={submit} noValidate>
        <TextField label="Name" value={v.name} onChange={set("name")} required autoFocus />
        <TextField label="Legal name" optional value={v.legalName} onChange={set("legalName")} />
        <div className={styles.grid2}>
          <TextField
            label="PAN"
            optional
            value={v.pan}
            onChange={set("pan")}
            error={reasonOf(v.pan, checkPan)}
            autoCapitalize="characters"
          />
          <TextField
            label="TAN"
            optional
            value={v.tan}
            onChange={set("tan")}
            error={reasonOf(v.tan, checkTan)}
            autoCapitalize="characters"
          />
        </div>
        <TextField
          label="GSTINs"
          optional
          description="Separate several with commas. Add filing frequency under Registrations."
          value={v.gstins}
          onChange={set("gstins")}
          error={gstinError}
          autoCapitalize="characters"
        />
        <TextField
          label="CIN"
          optional
          value={v.cin}
          onChange={set("cin")}
          error={reasonOf(v.cin, checkCin)}
          autoCapitalize="characters"
        />
        <Select
          label="Partner"
          value={v.partnerUserId}
          onValueChange={(x) => setV({ ...v, partnerUserId: x })}
          options={[
            { value: "none", label: "No partner" },
            ...people.map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
        <TextField
          label="Tags"
          optional
          description="Separate with commas."
          value={v.tags}
          onChange={set("tags")}
        />
        <TextArea label="Notes" optional rows={2} value={v.notes} onChange={set("notes")} />
        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
        <div className={styles.formActions}>
          <Button type="button" variant="plain" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            {initial ? "Save" : "Add client"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
