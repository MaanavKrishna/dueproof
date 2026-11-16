import { EditIcon, InfoIcon } from "@dueproof/icons";
import { type ComponentProps, type ReactNode, useId } from "react";
import { cx } from "../../utils/cx";
import { Button } from "../Button/Button";
import styles from "./Workings.module.css";

export interface WorkingsInput {
  label: string;
  /** Already formatted: "₹4,52,300", "18% a year", "142 days". */
  value: ReactNode;
  /** Where the input came from: "From the notice, page 1", "Entered by Priya". */
  source?: string;
}

export interface WorkingsStep {
  id: string;
  /** "Interest under section 50(1)". */
  label: string;
  /** "Tax × rate × days ÷ 365". */
  formula?: string;
  inputs?: WorkingsInput[];
  /** The step's result, usually an <Amount estimate>. */
  result: ReactNode;
  /** A caveat for this step. */
  note?: ReactNode;
}

export interface WorkingsProps extends Omit<ComponentProps<"section">, "title"> {
  /** "Interest to 16 Nov 2026". */
  title: ReactNode;
  steps: WorkingsStep[];
  /** The bottom line, e.g. total interest (an estimate). */
  total?: { label: string; value: ReactNode };
  /** Where the rates came from and when they were checked. */
  rateSource?: string;
  /** Lets the person change the inputs (e.g. the date, instalments paid). */
  onEditInputs?: () => void;
  /** Replaces the default "estimate, not advice" footnote. */
  footnote?: ReactNode;
}

/**
 * Shows the workings behind a computed amount: each step's formula, inputs
 * and result. Always labelled an estimate from the stated inputs, not advice.
 */
export function Workings({
  title,
  steps,
  total,
  rateSource,
  onEditInputs,
  footnote,
  className,
  ...rest
}: WorkingsProps) {
  const titleId = useId();
  return (
    <section className={cx(styles.workings, className)} aria-labelledby={titleId} {...rest}>
      <header className={styles.header}>
        <h3 id={titleId} className={styles.title}>
          {title}
        </h3>
        {onEditInputs ? (
          <Button size="sm" variant="plain" icon={EditIcon} onClick={onEditInputs}>
            Change inputs
          </Button>
        ) : null}
      </header>
      <ol className={styles.steps}>
        {steps.map((step, i) => (
          <li key={step.id} className={styles.step}>
            <span className={styles.index} aria-hidden="true">
              {i + 1}
            </span>
            <div className={styles.stepBody}>
              <div className={styles.stepHead}>
                <span className={styles.stepLabel}>{step.label}</span>
                <span className={styles.result}>{step.result}</span>
              </div>
              {step.formula ? (
                <p className={styles.formula}>
                  <span className={styles.srOnly}>Formula: </span>
                  {step.formula}
                </p>
              ) : null}
              {step.inputs?.length ? (
                <dl className={styles.inputs}>
                  {step.inputs.map((input) => (
                    <div key={input.label} className={styles.input}>
                      <dt>{input.label}</dt>
                      <dd>
                        <span className={styles.inputValue}>{input.value}</span>
                        {input.source ? (
                          <span className={styles.inputSource}>{input.source}</span>
                        ) : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {step.note ? <p className={styles.note}>{step.note}</p> : null}
            </div>
          </li>
        ))}
      </ol>
      {total ? (
        <div className={styles.total}>
          <span className={styles.totalLabel}>{total.label}</span>
          <span className={styles.totalValue}>{total.value}</span>
        </div>
      ) : null}
      <p className={styles.footnote}>
        <InfoIcon size={14} />
        <span>
          {footnote ?? (
            <>
              An estimate from the stated inputs, not advice.
              {rateSource ? ` ${rateSource}` : ""} Check with the statute before relying on it.
            </>
          )}
        </span>
      </p>
    </section>
  );
}
