import { InfoIcon } from "@dueproof/icons";
import { type ComponentProps, type ReactNode, useId } from "react";
import { cx } from "../../utils/cx";
import { Amount } from "../Amount/Amount";
import styles from "./ExposureSummary.module.css";

export interface ExposureRow {
  id: string;
  /** Client name (or a tax type, or a stage). */
  label: string;
  /** "27AAACH…", "3 open notices". */
  sublabel?: string;
  /** Demand as stated in notices, integer paise. */
  tax: number;
  /** Interest computed to the as-of date, integer paise (an estimate). */
  interest: number;
  /** Penalty as a range under the cited sections, integer paise (an estimate). */
  penalty: { min: number; max: number };
}

export interface ExposureSummaryProps extends Omit<ComponentProps<"section">, "title"> {
  title?: ReactNode;
  rows: ExposureRow[];
  /** "16 Nov 2026": interest is computed up to this date. */
  asOf: string;
  /** What a row is: "Client", "Tax type", "Stage". */
  rowHeader?: string;
  /** Short lakh/crore figures (full figures in the tooltip). Default true. */
  compact?: boolean;
  onRowSelect?: (id: string) => void;
  /** Footnote override. */
  footnote?: ReactNode;
}

/**
 * Open exposure by tax, interest and penalty heads with totals. Tax is as
 * stated in the notices; interest and penalty are estimates (penalty as a
 * range), styled and labelled so they never read as quoted figures.
 */
export function ExposureSummary({
  title = "Exposure",
  rows,
  asOf,
  rowHeader = "Client",
  compact = true,
  onRowSelect,
  footnote,
  className,
  ...rest
}: ExposureSummaryProps) {
  const captionId = useId();
  const sum = (f: (r: ExposureRow) => number) => rows.reduce((t, r) => t + f(r), 0);
  const totals = {
    tax: sum((r) => r.tax),
    interest: sum((r) => r.interest),
    min: sum((r) => r.penalty.min),
    max: sum((r) => r.penalty.max),
  };
  const totalMin = totals.tax + totals.interest + totals.min;
  const totalMax = totals.tax + totals.interest + totals.max;
  return (
    <section className={cx(styles.summary, className)} aria-labelledby={captionId} {...rest}>
      <header className={styles.header}>
        <h3 id={captionId} className={styles.title}>
          {title}
        </h3>
        <p className={styles.total}>
          <span className={styles.totalLabel}>Total open</span>
          <Amount minor={totalMin} to={totalMax} compact={compact} size="lg" estimate />
        </p>
      </header>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <caption className={styles.srOnly}>
            {typeof title === "string" ? title : "Exposure"} as of {asOf}
          </caption>
          <thead>
            <tr>
              <th scope="col">{rowHeader}</th>
              <th scope="col" className={styles.num}>
                Tax <span className={styles.headNote}>stated</span>
              </th>
              <th scope="col" className={styles.num}>
                Interest <span className={styles.headNote}>to {asOf}</span>
              </th>
              <th scope="col" className={styles.num}>
                Penalty <span className={styles.headNote}>range</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={cx(onRowSelect && styles.clickable)}>
                <th scope="row" className={styles.rowHead}>
                  {onRowSelect ? (
                    <button
                      type="button"
                      className={styles.rowButton}
                      onClick={() => onRowSelect(r.id)}
                    >
                      {r.label}
                    </button>
                  ) : (
                    r.label
                  )}
                  {r.sublabel ? <span className={styles.sublabel}>{r.sublabel}</span> : null}
                </th>
                <td className={styles.num}>
                  <Amount minor={r.tax} compact={compact} />
                </td>
                <td className={styles.num}>
                  <Amount minor={r.interest} compact={compact} estimate />
                </td>
                <td className={styles.num}>
                  <Amount minor={r.penalty.min} to={r.penalty.max} compact={compact} estimate />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td className={styles.num}>
                <Amount minor={totals.tax} compact={compact} />
              </td>
              <td className={styles.num}>
                <Amount minor={totals.interest} compact={compact} estimate />
              </td>
              <td className={styles.num}>
                <Amount minor={totals.min} to={totals.max} compact={compact} estimate />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className={styles.footnote}>
        <InfoIcon size={14} />
        <span>
          {footnote ??
            `Tax as stated in the notices. Interest to ${asOf} and the penalty range are estimates from the stated inputs, not advice.`}
        </span>
      </p>
    </section>
  );
}
