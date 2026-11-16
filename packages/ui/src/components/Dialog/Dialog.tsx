import { CloseIcon } from "@dueproof/icons";
import { Dialog as RadixDialog } from "radix-ui";
import type { ReactElement, ReactNode } from "react";
import { AnimatePresence, fade, MotionFeatures, m, sheet, useReducedMotion } from "../../motion";
import { cx } from "../../utils/cx";
import { useControllableState } from "../../utils/use-controllable";
import styles from "./Dialog.module.css";

export interface DialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** An element that opens the dialog (a Button). Optional when controlled. */
  trigger?: ReactElement;
  /** Required: the dialog's heading and accessible name. */
  title: ReactNode;
  /** One or two sentences under the title; the accessible description. */
  description?: ReactNode;
  children?: ReactNode;
  /** Actions, right-aligned: secondary first, primary last. */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Hide the corner close button (Escape still closes). */
  hideClose?: boolean;
  /**
   * Block closing by outside click — for forms with unsaved input and
   * destructive confirmations. Escape and the close button still work.
   */
  dismissible?: boolean;
  className?: string;
}

/**
 * A modal dialog. Focus moves in and is trapped; Escape closes; focus returns
 * to the trigger. Prefer an undo toast to a confirmation dialog when the action is reversible.
 */
export function Dialog({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
  size = "md",
  hideClose = false,
  dismissible = true,
  className,
}: DialogProps) {
  const [open, setOpen] = useControllableState(openProp, defaultOpen, onOpenChange);
  const reduce = useReducedMotion();
  return (
    <RadixDialog.Root open={open} onOpenChange={setOpen}>
      {trigger ? <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger> : null}
      <MotionFeatures>
        <AnimatePresence>
          {open ? (
            <RadixDialog.Portal forceMount>
              <RadixDialog.Overlay asChild forceMount>
                <m.div
                  className={styles.overlay}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={fade}
                />
              </RadixDialog.Overlay>
              <div className={styles.positioner}>
                <RadixDialog.Content
                  asChild
                  forceMount
                  {...(description ? {} : { "aria-describedby": undefined })}
                  onPointerDownOutside={(e) => {
                    if (!dismissible) e.preventDefault();
                  }}
                >
                  <m.div
                    className={cx(styles.dialog, styles[size], className)}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                    transition={sheet}
                  >
                    <header className={styles.header}>
                      <RadixDialog.Title className={styles.title}>{title}</RadixDialog.Title>
                      {description ? (
                        <RadixDialog.Description className={styles.description}>
                          {description}
                        </RadixDialog.Description>
                      ) : null}
                    </header>
                    {children ? <div className={styles.body}>{children}</div> : null}
                    {footer ? <footer className={styles.footer}>{footer}</footer> : null}
                    {hideClose ? null : (
                      <RadixDialog.Close className={styles.close} aria-label="Close">
                        <CloseIcon size={18} />
                      </RadixDialog.Close>
                    )}
                  </m.div>
                </RadixDialog.Content>
              </div>
            </RadixDialog.Portal>
          ) : null}
        </AnimatePresence>
      </MotionFeatures>
    </RadixDialog.Root>
  );
}

/** Closes the surrounding Dialog or Sheet. Wrap a Button: <DialogClose><Button>Cancel</Button></DialogClose>. */
export function DialogClose({ children }: { children: ReactElement }) {
  return <RadixDialog.Close asChild>{children}</RadixDialog.Close>;
}
