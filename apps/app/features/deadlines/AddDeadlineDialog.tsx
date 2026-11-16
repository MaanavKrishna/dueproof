"use client";
import { addDays, addWorkingDays } from "@dueproof/core/dates";
/**
 * Add a deadline by hand (origin human). The date picker's "N days" helpers
 * count with core's date engine, honouring the organisation's working days
 * and holidays; the server computes the stored basis.
 */
import { AddIcon } from "@dueproof/icons";
import {
  Button,
  Combobox,
  DatePicker,
  type DateResolver,
  Dialog,
  Select,
  TextArea,
  TextField,
} from "@dueproof/ui";
import { type FormEvent, useMemo, useState } from "react";
import { addManualDeadline } from "./actions";
import styles from "./deadlines.module.css";
import type { DeadlinesPageData } from "./queries";

export function AddDeadlineDialog({
  open,
  onOpenChange,
  data,
  onAdded,
  defaultClientId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: Pick<
    DeadlinesPageData,
    "today" | "holidays" | "workingDays" | "clients" | "people" | "cases"
  >;
  onAdded: () => void;
  defaultClientId?: string;
}) {
  const [title, setTitle] = useState("");
  const [dueOn, setDueOn] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(defaultClientId ?? null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [owner, setOwner] = useState<string>("none");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cal = useMemo(
    () => ({ workingDays: data.workingDays, holidays: data.holidays.map((h) => h.date) }),
    [data.workingDays, data.holidays],
  );
  const resolve: DateResolver = (from, days, kind) =>
    kind === "working" ? addWorkingDays(from, days, cal) : addDays(from, days);
  const holidayMap = useMemo(
    () => Object.fromEntries(data.holidays.map((h) => [h.date, h.name])),
    [data.holidays],
  );
  const caseOptions = data.cases
    .filter((c) => !clientId || c.clientId === clientId)
    .map((c) => ({ value: c.id, label: c.name }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError("Give the deadline a title.");
    if (!dueOn) return setError("Choose a due date.");
    setBusy(true);
    const res = await addManualDeadline({
      title,
      dueOn,
      clientId,
      caseId,
      ownerUserId: owner === "none" ? null : owner,
      note,
    });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setTitle("");
    setDueOn(null);
    setNote("");
    onOpenChange(false);
    onAdded();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      trigger={
        <Button variant="primary" icon={AddIcon}>
          Add deadline
        </Button>
      }
      title="Add a deadline"
      description="For a date agreed with an officer, a hearing, or anything the notices don't show."
      size="md"
    >
      <form className={styles.stack} onSubmit={submit} noValidate>
        <TextField
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
        />
        <DatePicker
          label="Due on"
          value={dueOn}
          onValueChange={setDueOn}
          today={data.today}
          holidays={holidayMap}
          referenceDate={data.today}
          referenceLabel="today"
          helpers={[
            { days: 7, kind: "calendar" },
            { days: 15, kind: "calendar" },
            { days: 30, kind: "calendar" },
            { days: 10, kind: "working" },
          ]}
          resolveDate={resolve}
        />
        <Combobox
          label="Client"
          optional
          options={data.clients.map((c) => ({ value: c.id, label: c.name }))}
          value={clientId}
          onValueChange={(v) => {
            setClientId(v);
            setCaseId(null);
          }}
          placeholder="Choose a client"
        />
        {caseOptions.length ? (
          <Combobox
            label="Case"
            optional
            options={caseOptions}
            value={caseId}
            onValueChange={setCaseId}
          />
        ) : null}
        <Select
          label="Owner"
          value={owner}
          onValueChange={setOwner}
          options={[
            { value: "none", label: "Unassigned" },
            ...data.people.map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
        <TextArea
          label="Why this date"
          optional
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={500}
        />
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
            Add deadline
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
