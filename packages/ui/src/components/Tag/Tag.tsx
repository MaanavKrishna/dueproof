import { CloseIcon, type Icon } from "@dueproof/icons";
import type { ComponentProps } from "react";
import { cx } from "../../utils/cx";
import styles from "./Tag.module.css";

export interface TagProps extends Omit<ComponentProps<"span">, "children"> {
  label: string;
  icon?: Icon;
  /** Shows a remove button (Backspace/Delete on the button also removes). */
  onRemove?: () => void;
  /** Accessible name of the remove button. Default "Remove {label}". */
  removeLabel?: string;
  size?: "sm" | "md";
}

/** A user-applied label (client group, filter value, keyword). */
export function Tag({
  label,
  icon: TagIcon,
  onRemove,
  removeLabel,
  size = "md",
  className,
  ...rest
}: TagProps) {
  return (
    <span
      className={cx(styles.tag, styles[size], onRemove && styles.removable, className)}
      {...rest}
    >
      {TagIcon ? <TagIcon size={14} className={styles.icon} /> : null}
      <span className={styles.label}>{label}</span>
      {onRemove ? (
        <button
          type="button"
          className={styles.remove}
          aria-label={removeLabel ?? `Remove ${label}`}
          onClick={onRemove}
          onKeyDown={(e) => {
            if (e.key === "Backspace" || e.key === "Delete") {
              e.preventDefault();
              onRemove();
            }
          }}
        >
          <CloseIcon size={12} strokeWidth={2} />
        </button>
      ) : null}
    </span>
  );
}
