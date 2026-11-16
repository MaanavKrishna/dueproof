"use client";
/**
 * Drop zone, upload tray and the password step, wired to the upload
 * actions and live status. The Inbox and the case thread both use it.
 */
import { LockIcon } from "@dueproof/icons";
import { Button, Dialog, FileDropZone, TextField, UploadTray, useToast } from "@dueproof/ui";
import { type FormEvent, useState } from "react";
import styles from "./screen.module.css";
import { type TrackedUpload, type UploadRole, useUploads } from "./useUploads";

const MAX_BYTES = 50 * 1_048_576;

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
  const uploads = useUploads({
    ...(documentRole ? { role: documentRole } : {}),
    ...(caseId ? { caseId } : {}),
    ...(initial ? { initial } : {}),
    ...(onSettled ? { onSettled } : {}),
  });
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
      <Dialog
        open={passwordFor !== null}
        onOpenChange={(o) => {
          if (!o) setPasswordFor(null);
        }}
        title="This PDF needs a password"
        description={`${passwordItem?.name ?? "The file"} is protected. The password is used in memory for this read and never stored.`}
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
