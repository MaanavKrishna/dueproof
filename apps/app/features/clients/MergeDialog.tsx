"use client";
/** Merge two clients that are the same firm: pick the one to keep; the other is archived. */
import { Button, Dialog, Radio, RadioGroup } from "@dueproof/ui";
import { useState } from "react";
import { mergeClients } from "./actions";
import styles from "./clients.module.css";

export function MergeDialog({
  group,
  onOpenChange,
  onDone,
}: {
  group: { key: string; clients: { id: string; name: string }[] } | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [keep, setKeep] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!group) return null;
  const keepId = keep ?? group.clients[0]?.id ?? "";
  async function merge() {
    if (!group) return;
    setBusy(true);
    setError(null);
    for (const c of group.clients) {
      if (c.id === keepId) continue;
      const res = await mergeClients(keepId, c.id);
      if (!res.ok) {
        setBusy(false);
        return setError(res.message);
      }
    }
    setBusy(false);
    onDone();
  }
  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title="Merge duplicate clients"
      description={`These share ${group.key}. Cases, documents, deadlines, registrations and contacts move to the client you keep; the other is archived, not deleted.`}
      size="sm"
      footer={
        <Button variant="primary" loading={busy} onClick={merge}>
          Merge
        </Button>
      }
    >
      <div className={styles.form}>
        <RadioGroup label="Keep" value={keepId} onValueChange={setKeep}>
          {group.clients.map((c) => (
            <Radio key={c.id} value={c.id} label={c.name} />
          ))}
        </RadioGroup>
        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
