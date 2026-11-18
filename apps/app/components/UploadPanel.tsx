"use client";
/**
 * Drop zone, upload tray and the password step, wired to the upload
 * actions and live status. The Inbox and the case thread both use it.
 *
 * The received date is asked for, never assumed: "Received on" (today by
 * default) goes with every file added, and each file's date can be changed
 * in the list under the tray, before or after it is read. Deadlines that
 * run from receipt are counted from it.
 */
import { LockIcon } from "@dueproof/icons";
import {
  Button,
  DatePicker,
  Dialog,
  FileDropZone,
  TextField,
  UploadTray,
  useToast,
} from "@dueproof/ui";
import { type FormEvent, useState } from "react";
import styles from "./screen.module.css";
import { type TrackedUpload, type UploadRole, useUploads } from "./useUploads";

const MAX_BYTES = 50 * 1_048_576;

/** Today on this device, as an ISO date. */
function localToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function UploadPanel({
  documentRole,
  caseId,
  initial,
  onSettled,
  onOpen,
  title,
  description,
  size = "lg",
}: {
  documentRole?: UploadRole;
  caseId?: string;
  initial?: TrackedUpload[];
  onSettled?: (documentId: string, status: string) => void;
  onOpen?: (documentId: string) => void;
  title?: string;
  description?: string;
  size?: "md" | "lg";
}) {
  const { toast } = useToast();
  const [today] = useState(localToday);
  const [receivedOn, setReceivedOn] = useState<string>(today);
  const uploads = useUploads({
    ...(documentRole ? { role: documentRole } : {}),
    ...(caseId ? { caseId } : {}),
    ...(initial ? { initial } : {}),
    ...(onSettled ? { onSettled } : {}),
    receivedOn,
  });
  const dated = uploads.items.filter(
    (i) => i.receivedOn && !["duplicate", "quarantined", "failed"].includes(i.stage),
  );

  async function changeReceived(id: string, date: string) {
    const problem = await uploads.setReceived(id, date);
    if (problem)
      return toast({ tone: "danger", title: "Received date not changed", description: problem });
    toast({
      tone: "success",
      title: "Received date changed",
      description: "Deadlines that run from receipt count from the new date.",
    });
  }
  const [passwordFor, setPasswordFor] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordItem = uploads.items.find((i) => i.id === passwordFor);

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    if (!passwordFor) return;
    setBusy(true);
    const problem = await uploads.unlock(passwordFor, password);
    setBusy(false);
    if (problem) return setError(problem);
    setPassword("");
    setError(null);
    setPasswordFor(null);
  }

  return (
    <div className={styles.stack}>
      <DatePicker
        label="Received on"
        description="The day these documents reached you. Deadlines that run from receipt count from it."
        value={receivedOn}
        onValueChange={(d) => setReceivedOn(d ?? today)}
        max={today}
        today={today}
        size="sm"
      />
      <FileDropZone
        size={size}
        accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,application/pdf,image/jpeg,image/png,image/tiff"
        maxSize={MAX_BYTES}
        camera
        title={title ?? "Drop notices here, or choose files"}
        description={description ?? "PDF, JPG, PNG or TIFF, up to 50 MB each. Folders work too."}
        onFiles={uploads.add}
        onReject={(rejections) =>
          toast({
            tone: "warning",
            title: `${rejections.length} file${rejections.length === 1 ? "" : "s"} not added`,
            description: rejections.map((r) => `${r.file.name}: ${r.reason}`).join(" · "),
          })
        }
      />
      {uploads.items.length > 0 ? (
        <UploadTray
          items={uploads.items}
          onRetry={(id) => void uploads.retry(id)}
          onRemove={uploads.remove}
          onClearDone={uploads.clearDone}
          onEnterPassword={(id) => {
            setPasswordFor(id);
            setError(null);
          }}
          {...(onOpen
            ? {
                onOpen: (id: string) => {
                  const doc = uploads.items.find((i) => i.id === id)?.documentId;
                  if (doc) onOpen(doc);
                },
              }
            : {})}
        />
      ) : null}
      {dated.length ? (
        <ul className={styles.list} aria-label="Received dates">
          {dated.map((i) => (
            <li key={i.id} className={styles.spread}>
              <span className={styles.small}>{i.name}</span>
              <DatePicker
                label={`Received on, ${i.name}`}
                hideLabel
                value={i.receivedOn ?? null}
                onValueChange={(d) => {
                  if (d && d !== i.receivedOn) void changeReceived(i.id, d);
                }}
                max={today}
                today={today}
                size="sm"
              />
            </li>
          ))}
        </ul>
      ) : null}
      <Dialog
        open={passwordFor !== null}
        onOpenChange={(o) => {
          if (!o) setPasswordFor(null);
        }}
        title="This PDF needs a password"
        description={`${passwordItem?.name ?? "The file"} is protected. The password is kept encrypted for this read only, then deleted.`}
        size="sm"
        dismissible={false}
      >
        <form className={styles.stack} onSubmit={submitPassword}>
          <TextField
            label="Password"
            type="password"
            icon={LockIcon}
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            {...(error ? { error } : {})}
            autoFocus
          />
          <div className={styles.row}>
            <Button type="submit" variant="primary" loading={busy}>
              Read it
            </Button>
            <Button type="button" variant="secondary" onClick={() => setPasswordFor(null)}>
              Not now
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
