"use client";
/** Add or edit a client contact. The WhatsApp number matches forwarded documents to this client. */
import { Button, Dialog, TextField } from "@dueproof/ui";
import { type FormEvent, useState } from "react";
import { saveContact } from "./actions";
import styles from "./clients.module.css";
import type { ContactRow } from "./queries";

export function ContactDialog({
  clientId,
  initial,
  onClose,
  onSaved,
}: {
  clientId: string;
  initial: ContactRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [v, setV] = useState({
    name: initial?.name ?? "",
    role: initial?.role ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    whatsapp: initial?.whatsapp ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) =>
    setV({ ...v, [k]: e.target.value });
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await saveContact(clientId, { ...(initial ? { id: initial.id } : {}), ...v });
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
      title={initial ? "Edit contact" : "Add a contact"}
      size="sm"
    >
      <form className={styles.form} onSubmit={submit} noValidate>
        <TextField label="Name" value={v.name} onChange={set("name")} required autoFocus />
        <TextField
          label="Role"
          optional
          value={v.role}
          onChange={set("role")}
          placeholder="Accounts head"
        />
        <TextField label="Email" optional type="email" value={v.email} onChange={set("email")} />
        <TextField label="Phone" optional type="tel" value={v.phone} onChange={set("phone")} />
        <TextField
          label="WhatsApp"
          optional
          type="tel"
          description="Documents forwarded from this number are filed under this client, for a person to confirm."
          value={v.whatsapp}
          onChange={set("whatsapp")}
        />
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
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
