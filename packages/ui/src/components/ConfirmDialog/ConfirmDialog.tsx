import { type ReactElement, type ReactNode, useEffect, useState } from "react";
import { useControllableState } from "../../utils/use-controllable";
import { Button } from "../Button/Button";
import { Dialog, DialogClose } from "../Dialog/Dialog";
import { TextField } from "../TextField/TextField";
import styles from "./ConfirmDialog.module.css";

export interface ConfirmDialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The element that opens the dialog. */
  trigger?: ReactElement;
  /** A question naming the thing: "Delete Harbour Valley Foods?" */
  title: ReactNode;
  /** What will happen, plainly. Say if it can't be undone. */
  description?: ReactNode;
  /** The verb: "Delete client", not "OK". */
  confirmLabel: string;
  cancelLabel?: string;
  /** danger: destructive, irreversible actions (red button). */
  tone?: "default" | "danger";
  /**
   * Type-to-confirm: the person must type this exactly (e.g. the client's name)
   * before the button enables. Use for irreversible actions only.
   */
  confirmText?: string;
  /** Runs on confirm. A promise keeps the dialog open with a spinner until it settles. */
  onConfirm: () => void | Promise<void>;
  /** Extra content between the description and the buttons. */
  children?: ReactNode;
}

/**
 * Asks before a consequential action. Prefer an undo toast when the action is
 * reversible; use type-to-confirm for irreversible ones.
 */
export function ConfirmDialog({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "default",
  confirmText,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const [open, setOpen] = useControllableState(openProp, defaultOpen, onOpenChange);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setTyped("");
      setBusy(false);
      setError(null);
    }
  }, [open]);

  const matches = confirmText === undefined || typed.trim() === confirmText;

  const confirm = async () => {
    if (!matches || busy) return;
    setError(null);
    try {
      const result = onConfirm();
      if (result instanceof Promise) {
        setBusy(true);
        await result;
      }
      setOpen(false);
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) setOpen(next);
      }}
      {...(trigger ? { trigger } : {})}
      title={title}
      description={description}
      size="sm"
      dismissible={!busy && confirmText === undefined}
      hideClose
      footer={
        <>
          <DialogClose>
            <Button variant="secondary" disabled={busy}>
              {cancelLabel}
            </Button>
          </DialogClose>
          <Button
            variant={tone === "danger" ? "destructive" : "primary"}
            disabled={!matches}
            loading={busy}
            onClick={confirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {confirmText !== undefined ? (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
        >
          <TextField
            label={
              <>
                Type <strong className={styles.phrase}>{confirmText}</strong> to confirm
              </>
            }
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
          />
        </form>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
