import { formatMoney, type MinorAmount } from "@dueproof/i18n";
import type { ComponentProps } from "react";
import { cx } from "../../utils/cx";
import styles from "./Amount.module.css";

export interface AmountProps extends Omit<ComponentProps<"data">, "children" | "value"> {
  /** Integer minor units (paise for INR). Never a float. */
  minor: MinorAmount;
  /** "₹4.52 lakh", "₹1.2 crore" instead of the full figure (the full figure is the tooltip). */
  compact?: boolean;
  currency?: string;
  locale?: string;
  /**
   * A computed estimate (interest to date, a penalty range), not an amount
   * quoted from a page. Styled differently and announced as an estimate.
   */
  estimate?: boolean;
  /** An upper bound: renders a range "₹10,000 – ₹50,000". */
  to?: MinorAmount;
  size?: "sm" | "md" | "lg" | "xl";
  /** "danger" for overdue demand; "muted" for paid or dropped amounts. */
  tone?: "default" | "danger" | "muted" | "positive";
  /** Strike through (paid, dropped). */
  struck?: boolean;
}

/**
 * Money from integer paise: Indian grouping (₹4,52,300), optional lakh/crore
 * short form, tabular figures. Estimates are marked "≈ … est." so they never
 * look like amounts quoted from a notice.
 */
export function Amount({
  minor,
  compact = false,
  currency = "INR",
  locale = "en-IN",
  estimate = false,
  to,
  size = "md",
  tone = "default",
  struck = false,
  className,
  ...rest
}: AmountProps) {
  const fmt = (v: MinorAmount, c: boolean) => formatMoney(v, { locale, currency, compact: c });
  const text = fmt(minor, compact);
  const full = fmt(minor, false);
  const toText = to !== undefined ? fmt(to, compact) : null;
  const toFull = to !== undefined ? fmt(to, false) : null;
  const spokenRange = toText ? `${full} to ${toFull}` : full;
  return (
    <data
      value={String(minor)}
      className={cx(
        styles.amount,
        styles[size],
        styles[tone],
        estimate && styles.estimate,
        struck && styles.struck,
        className,
      )}
      title={compact || estimate ? `${estimate ? "Estimate: " : ""}${spokenRange}` : undefined}
      {...rest}
    >
      {estimate ? (
        <span className={styles.approx} aria-hidden="true">
          ≈
        </span>
      ) : null}
      <span aria-hidden={estimate || undefined}>
        {text}
        {toText ? (
          <>
            <span className={styles.dash}> – </span>
            {toText}
          </>
        ) : null}
      </span>
      {estimate ? (
        <>
          <span className={styles.est} aria-hidden="true">
            est.
          </span>
          <span className={styles.srOnly}>Estimate: {spokenRange}</span>
        </>
      ) : null}
    </data>
  );
}
