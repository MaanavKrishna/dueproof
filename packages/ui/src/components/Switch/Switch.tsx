import { Switch as RadixSwitch } from "radix-ui";
import { type ComponentProps, type ReactNode, useId } from "react";
import { cx } from "../../utils/cx";
import styles from "./Switch.module.css";

export interface SwitchProps
  extends Omit<ComponentProps<typeof RadixSwitch.Root>, "children" | "asChild"> {
  /** Visible label. Omit only when labelled elsewhere (then pass aria-label). */
  label?: ReactNode;
  description?: ReactNode;
  /** Label before (default, settings-list style) or after the switch. */
  labelPosition?: "start" | "end";
  size?: "sm" | "md";
}

/** A setting that takes effect immediately. For choices submitted with a form, use Checkbox. */
export function Switch({
  label,
  description,
  labelPosition = "start",
  size = "md",
  id: idProp,
  className,
  ...rest
}: SwitchProps) {
  const auto = useId();
  const id = idProp ?? `dp-switch-${auto}`;
  const descId = description ? `${id}-description` : undefined;
  const control = (
    <RadixSwitch.Root
      id={id}
      aria-describedby={descId}
      className={cx(styles.switch, styles[size], !label && className)}
      {...rest}
    >
      <RadixSwitch.Thumb className={styles.thumb} />
    </RadixSwitch.Root>
  );
  if (!label) return control;
  return (
    <div
      className={cx(styles.row, labelPosition === "end" && styles.end, className)}
      data-disabled={rest.disabled ? "" : undefined}
    >
      <div className={styles.text}>
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
        {description ? (
          <p id={descId} className={styles.description}>
            {description}
          </p>
        ) : null}
      </div>
      {control}
    </div>
  );
}
