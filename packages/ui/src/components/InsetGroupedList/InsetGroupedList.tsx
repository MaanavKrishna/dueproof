import { ChevronRightIcon, type Icon } from "@dueproof/icons";
import { type ComponentProps, type ReactNode, useId } from "react";
import { cx } from "../../utils/cx";
import { Switch } from "../Switch/Switch";
import styles from "./InsetGroupedList.module.css";

export interface InsetGroupedListProps extends Omit<ComponentProps<"section">, "title"> {
  /** Small heading above the group. */
  header?: ReactNode;
  /** Help text under the group. */
  footer?: ReactNode;
  children: ReactNode;
}

/** Apple-style inset grouped list: rounded white group on the canvas, hairline separators. */
export function InsetGroupedList({
  header,
  footer,
  children,
  className,
  ...rest
}: InsetGroupedListProps) {
  const headerId = useId();
  return (
    <section
      className={cx(styles.group, className)}
      aria-labelledby={header ? headerId : undefined}
      {...rest}
    >
      {header ? (
        <h3 id={headerId} className={styles.header}>
          {header}
        </h3>
      ) : null}
      <ul className={styles.list}>{children}</ul>
      {footer ? <p className={styles.footer}>{footer}</p> : null}
    </section>
  );
}

interface ListRowBase {
  label: ReactNode;
  description?: ReactNode;
  icon?: Icon;
  /** "danger" for destructive rows (Sign out, Delete organisation). */
  tone?: "default" | "danger" | "accent";
  disabled?: boolean;
  className?: string;
}

export interface ListRowProps extends ListRowBase {
  /** A value on the right ("Monthly", "IST"). */
  value?: ReactNode;
  /** Makes the row a button with a chevron. */
  onClick?: () => void;
  /** Makes the row a link with a chevron. */
  href?: string;
  /** Show the chevron (default: when the row navigates). */
  chevron?: boolean;
  /** Any trailing control (a Select, a Button). */
  control?: ReactNode;
  /** A switch on the right, labelled by the row. */
  toggle?: { checked: boolean; onCheckedChange: (checked: boolean) => void };
}

/** One row: label, optional description, value, chevron, switch or control. */
export function ListRow({
  label,
  description,
  icon: RowIcon,
  tone = "default",
  disabled,
  value,
  onClick,
  href,
  chevron,
  control,
  toggle,
  className,
}: ListRowProps) {
  const labelId = useId();
  const descId = useId();
  const showChevron = chevron ?? Boolean(onClick || href);
  const body = (
    <>
      {RowIcon ? (
        <span className={styles.icon}>
          <RowIcon size={18} />
        </span>
      ) : null}
      <span className={styles.text}>
        <span id={labelId} className={styles.label}>
          {label}
        </span>
        {description ? (
          <span id={descId} className={styles.description}>
            {description}
          </span>
        ) : null}
      </span>
      {value !== undefined ? <span className={styles.value}>{value}</span> : null}
      {control ? <span className={styles.control}>{control}</span> : null}
      {toggle ? (
        <Switch
          checked={toggle.checked}
          onCheckedChange={toggle.onCheckedChange}
          aria-labelledby={labelId}
          aria-describedby={description ? descId : undefined}
          disabled={disabled}
        />
      ) : null}
      {showChevron ? <ChevronRightIcon size={16} className={styles.chevron} /> : null}
    </>
  );
  const rowClass = cx(styles.row, styles[tone], className);
  return (
    <li className={styles.item}>
      {href ? (
        <a
          href={href}
          className={cx(rowClass, styles.interactive)}
          aria-disabled={disabled || undefined}
        >
          {body}
        </a>
      ) : onClick ? (
        <button
          type="button"
          className={cx(rowClass, styles.interactive)}
          onClick={onClick}
          disabled={disabled}
        >
          {body}
        </button>
      ) : (
        <div className={rowClass} data-disabled={disabled || undefined}>
          {body}
        </div>
      )}
    </li>
  );
}
