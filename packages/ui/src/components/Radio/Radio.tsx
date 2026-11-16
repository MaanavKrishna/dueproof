import { RadioGroup as RadixRadio } from "radix-ui";
import { type ComponentProps, type ReactNode, useId } from "react";
import { cx } from "../../utils/cx";
import checkboxStyles from "../Checkbox/Checkbox.module.css";
import styles from "./Radio.module.css";

export interface RadioGroupProps
  extends Omit<ComponentProps<typeof RadixRadio.Root>, "asChild" | "children"> {
  /** Group label (rendered as the group's accessible name). */
  label: ReactNode;
  hideLabel?: boolean;
  description?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}

/** One choice from a few visible options. Arrow keys move and select. */
export function RadioGroup({
  label,
  hideLabel = false,
  description,
  error,
  className,
  children,
  orientation = "vertical",
  ...rest
}: RadioGroupProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const descId = description ? `${id}-description` : undefined;
  const errId = error ? `${id}-error` : undefined;
  return (
    <div className={cx(styles.group, className)}>
      <span id={labelId} className={cx(styles.legend, hideLabel && styles.hidden)}>
        {label}
      </span>
      {description ? (
        <p id={descId} className={checkboxStyles.description}>
          {description}
        </p>
      ) : null}
      <RadixRadio.Root
        aria-labelledby={labelId}
        aria-describedby={[errId, descId].filter(Boolean).join(" ") || undefined}
        aria-invalid={error ? true : undefined}
        orientation={orientation}
        className={cx(styles.items, orientation === "horizontal" && styles.horizontal)}
        {...rest}
      >
        {children}
      </RadixRadio.Root>
      {error ? (
        <p id={errId} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface RadioProps
  extends Omit<ComponentProps<typeof RadixRadio.Item>, "asChild" | "children"> {
  label: ReactNode;
  description?: ReactNode;
}

export function Radio({ label, description, id: idProp, className, ...rest }: RadioProps) {
  const auto = useId();
  const id = idProp ?? `dp-radio-${auto}`;
  const descId = description ? `${id}-description` : undefined;
  return (
    <div
      className={cx(checkboxStyles.row, className)}
      data-disabled={rest.disabled ? "" : undefined}
    >
      <RadixRadio.Item id={id} aria-describedby={descId} className={styles.radio} {...rest}>
        <RadixRadio.Indicator className={styles.dot} />
      </RadixRadio.Item>
      <div className={checkboxStyles.text}>
        <label htmlFor={id} className={checkboxStyles.label}>
          {label}
        </label>
        {description ? (
          <p id={descId} className={checkboxStyles.description}>
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
