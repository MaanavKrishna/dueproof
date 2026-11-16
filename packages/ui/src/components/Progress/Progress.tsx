import { AlertIcon, CheckIcon } from "@dueproof/icons";
import { Progress as RadixProgress } from "radix-ui";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { cx } from "../../utils/cx";
import styles from "./Progress.module.css";

export interface ProgressBarProps extends Omit<ComponentProps<"div">, "children"> {
  /** 0–max. Omit (or null) for indeterminate. */
  value?: number | null;
  max?: number;
  /** Accessible name; shown above the bar unless `hideLabel`. */
  label: string;
  hideLabel?: boolean;
  /** Text on the right, e.g. "3 of 5 pages". Defaults to a percentage. */
  valueText?: string;
  tone?: "accent" | "success" | "danger";
  size?: "sm" | "md";
}

/** Progress of a task with a known (or unknown) amount of work. */
export function ProgressBar({
  value = null,
  max = 100,
  label,
  hideLabel = false,
  valueText,
  tone = "accent",
  size = "md",
  className,
  ...rest
}: ProgressBarProps) {
  const pct = value === null ? null : Math.min(100, Math.max(0, (value / max) * 100));
  const text = valueText ?? (pct === null ? undefined : `${Math.round(pct)}%`);
  return (
    <div className={cx(styles.barField, className)} {...rest}>
      {hideLabel ? null : (
        <div className={styles.barLabel}>
          <span>{label}</span>
          {text ? <span className={styles.barValue}>{text}</span> : null}
        </div>
      )}
      <RadixProgress.Root
        value={value}
        max={max}
        aria-label={label}
        {...(text ? { getValueLabel: () => text } : {})}
        className={cx(styles.bar, styles[size], styles[tone])}
      >
        <RadixProgress.Indicator
          className={cx(styles.indicator, pct === null && styles.indeterminate)}
          style={pct === null ? undefined : { transform: `translateX(-${100 - pct}%)` }}
        />
      </RadixProgress.Root>
    </div>
  );
}

export interface ProgressRingProps extends Omit<ComponentProps<"div">, "children"> {
  value: number;
  max?: number;
  label: string;
  size?: "sm" | "md" | "lg";
  /** Show the percentage inside (md and lg only). */
  showValue?: boolean;
  tone?: "accent" | "success" | "danger";
}

/** Compact circular progress, e.g. "4 of 6 findings verified". */
export function ProgressRing({
  value,
  max = 100,
  label,
  size = "md",
  showValue = false,
  tone = "accent",
  className,
  ...rest
}: ProgressRingProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const r = 15.5;
  const c = 2 * Math.PI * r;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cx(styles.ring, styles[`ring-${size}`], styles[tone], className)}
      style={{ "--dash": `${(pct / 100) * c} ${c}` } as CSSProperties}
      {...rest}
    >
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r={r} className={styles.ringTrack} />
        <circle cx="18" cy="18" r={r} className={styles.ringValue} />
      </svg>
      {showValue && size !== "sm" ? (
        <span className={styles.ringText}>{Math.round(pct)}%</span>
      ) : null}
    </div>
  );
}

export type StepStatus = "complete" | "current" | "upcoming" | "error";

export interface Step {
  label: string;
  status: StepStatus;
  /** Extra line under the label, e.g. "2 pages" or an error reason. */
  detail?: ReactNode;
}

export interface StepperProps extends Omit<ComponentProps<"ol">, "children"> {
  steps: Step[];
  /** Accessible name, e.g. "Processing notice". */
  label: string;
  orientation?: "horizontal" | "vertical";
}

const statusWords: Record<StepStatus, string> = {
  complete: "done",
  current: "in progress",
  upcoming: "not started",
  error: "failed",
};

/** Stage-by-stage progress, e.g. reading a notice: Upload · Read · Find dates · Check proof. */
export function Stepper({
  steps,
  label,
  orientation = "horizontal",
  className,
  ...rest
}: StepperProps) {
  return (
    <ol aria-label={label} className={cx(styles.stepper, styles[orientation], className)} {...rest}>
      {steps.map((step, i) => (
        <li
          key={step.label}
          className={cx(styles.step, styles[step.status])}
          aria-current={step.status === "current" ? "step" : undefined}
        >
          <span className={styles.marker} aria-hidden="true">
            {step.status === "complete" ? (
              <CheckIcon size={14} strokeWidth={2.5} />
            ) : step.status === "error" ? (
              <AlertIcon size={14} strokeWidth={2} />
            ) : (
              i + 1
            )}
          </span>
          <span className={styles.stepText}>
            <span className={styles.stepLabel}>
              {step.label}
              <span className={styles.srOnly}>, {statusWords[step.status]}</span>
            </span>
            {step.detail ? <span className={styles.stepDetail}>{step.detail}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
