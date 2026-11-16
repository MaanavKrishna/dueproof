import { CloseIcon } from "@dueproof/icons";
import { Dialog as RadixDialog } from "radix-ui";
import type { ReactElement, ReactNode } from "react";
import { AnimatePresence, fade, MotionFeatures, m, sheet, useReducedMotion } from "../../motion";
import { cx } from "../../utils/cx";
import { useControllableState } from "../../utils/use-controllable";
import styles from "./Sheet.module.css";

export type SheetSide = "right" | "left" | "bottom";

export interface SheetProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactElement;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** right: inspector-style panel (default). bottom: phone-style sheet. */
  side?: SheetSide;
  /**
   * modal (default): dims the page and traps focus.
   * Non-modal sheets leave the page usable (like the inspector).
   */
  modal?: boolean;
  className?: string;
}

const offscreen: Record<SheetSide, { x?: string; y?: string }> = {
  right: { x: "100%" },
  left: { x: "-100%" },
  bottom: { y: "100%" },
};

/** A panel that slides in from an edge, on a translucent material. */
export function Sheet({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
  side = "right",
  modal = true,
  className,
}: SheetProps) {
  const [open, setOpen] = useControllableState(openProp, defaultOpen, onOpenChange);
  const reduce = useReducedMotion();
  const hidden = reduce ? { opacity: 0 } : { ...offscreen[side] };
  return (
    <RadixDialog.Root open={open} onOpenChange={setOpen} modal={modal}>
      {trigger ? <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger> : null}
      <MotionFeatures>
        <AnimatePresence>
          {open ? (
            <RadixDialog.Portal forceMount>
              {modal ? (
                <RadixDialog.Overlay asChild forceMount>
                  <m.div
                    className={styles.overlay}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={fade}
                  />
                </RadixDialog.Overlay>
              ) : null}
              <RadixDialog.Content
                asChild
                forceMount
                {...(description ? {} : { "aria-describedby": undefined })}
                onInteractOutside={(e) => {
                  if (!modal) e.preventDefault();
                }}
              >
                <m.div
                  className={cx(styles.sheet, styles[side], className)}
                  initial={hidden}
                  animate={{ x: 0, y: 0, opacity: 1 }}
                  exit={hidden}
                  transition={sheet}
                >
                  {side === "bottom" ? <div className={styles.grabber} aria-hidden="true" /> : null}
                  <header className={styles.header}>
                    <div className={styles.titles}>
                      <RadixDialog.Title className={styles.title}>{title}</RadixDialog.Title>
                      {description ? (
                        <RadixDialog.Description className={styles.description}>
                          {description}
                        </RadixDialog.Description>
                      ) : null}
                    </div>
                    <RadixDialog.Close className={styles.close} aria-label="Close">
                      <CloseIcon size={18} />
                    </RadixDialog.Close>
                  </header>
                  <div className={styles.body}>{children}</div>
                  {footer ? <footer className={styles.footer}>{footer}</footer> : null}
                </m.div>
              </RadixDialog.Content>
            </RadixDialog.Portal>
          ) : null}
        </AnimatePresence>
      </MotionFeatures>
    </RadixDialog.Root>
  );
}
