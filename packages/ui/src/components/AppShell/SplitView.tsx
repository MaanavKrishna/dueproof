import { CloseIcon } from "@dueproof/icons";
import { type ComponentProps, type KeyboardEvent, type ReactNode, useId } from "react";
import { AnimatePresence, fade, MotionFeatures, m, sheet, useReducedMotion } from "../../motion";
import { cx } from "../../utils/cx";
import { useMediaQuery } from "../../utils/dom";
import { IconButton } from "../IconButton/IconButton";
import styles from "./SplitView.module.css";

export interface SplitViewProps extends Omit<ComponentProps<"div">, "title"> {
  /** The main content. */
  children: ReactNode;
  /** The inspector's content (a proof viewer, a record's details). */
  inspector?: ReactNode;
  /** Whether the inspector shows. Default true when `inspector` is given. */
  inspectorOpen?: boolean;
  /** Called with false by the close button and Escape (when the inspector overlays). */
  onInspectorOpenChange?: (open: boolean) => void;
  /** The inspector's heading, also its accessible name. */
  inspectorTitle?: ReactNode;
  /** Accessible name when the title isn't plain text. */
  inspectorLabel?: string;
  /** Extra controls in the inspector header, before the close button. */
  inspectorActions?: ReactNode;
  /** Wider inspector, e.g. for the proof viewer on large screens. */
  inspectorSize?: "md" | "lg";
}

/**
 * Content with an optional inspector on the right (02 §6: 440 px). At 1280 px
 * and wider the inspector sits beside the content; narrower, it overlays the
 * content; on phones it becomes a full-screen pane.
 */
export function SplitView({
  children,
  inspector,
  inspectorOpen,
  onInspectorOpenChange,
  inspectorTitle,
  inspectorLabel,
  inspectorActions,
  inspectorSize = "md",
  className,
  ...rest
}: SplitViewProps) {
  const open = inspector != null && (inspectorOpen ?? true);
  const overlays = useMediaQuery("(width < 80rem)");
  const reduce = useReducedMotion();
  const titleId = useId();
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape" && overlays && onInspectorOpenChange) {
      e.stopPropagation();
      onInspectorOpenChange(false);
    }
  };
  return (
    <div
      className={cx(styles.split, className)}
      data-inspector={open ? "open" : "closed"}
      data-size={inspectorSize}
      {...rest}
    >
      <div className={styles.primary}>{children}</div>
      <MotionFeatures>
        <AnimatePresence initial={false}>
          {open ? (
            <m.aside
              key="inspector"
              className={styles.inspector}
              aria-labelledby={inspectorTitle && !inspectorLabel ? titleId : undefined}
              aria-label={inspectorLabel}
              onKeyDown={onKeyDown}
              initial={reduce || !overlays ? { opacity: 0 } : { opacity: 0, x: "8%" }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce || !overlays ? { opacity: 0 } : { opacity: 0, x: "8%" }}
              transition={reduce ? fade : sheet}
            >
              {inspectorTitle || onInspectorOpenChange || inspectorActions ? (
                <header className={styles.header}>
                  <h2 id={titleId} className={styles.title}>
                    {inspectorTitle}
                  </h2>
                  <div className={styles.actions}>
                    {inspectorActions}
                    {onInspectorOpenChange ? (
                      <IconButton
                        icon={CloseIcon}
                        label="Close inspector"
                        size="sm"
                        onClick={() => onInspectorOpenChange(false)}
                      />
                    ) : null}
                  </div>
                </header>
              ) : null}
              <div className={styles.body}>{inspector}</div>
            </m.aside>
          ) : null}
        </AnimatePresence>
      </MotionFeatures>
    </div>
  );
}
