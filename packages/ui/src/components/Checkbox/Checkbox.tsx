import { CheckIcon, MinusIcon } from "@dueproof/icons";
import { Checkbox as RadixCheckbox } from "radix-ui";
import { type ComponentProps, type ReactNode, useId } from "react";
import { cx } from "../../utils/cx";
import styles from "./Checkbox.module.css";

export interface CheckboxProps
  extends Omit<ComponentProps<typeof RadixCheckbox.Root>, "children" | "asChild"> {
  /** Visible label. Omit only when the checkbox is labelled elsewhere (then pass aria-label). */
  label?: ReactNode;
  description?: ReactNode;
  invalid?: boolean;
}

/** On/off choice, or "some" (indeterminate) for a parent of a partly-selected group. */
export function Checkbox({
  label,
  description,
  invalid,
  id: idProp,
  className,
  ...rest
}: CheckboxProps) {
  const auto = useId();
  const id = idProp ?? `dp-checkbox-${auto}`;
  const descId = description ? `${id}-description` : undefined;
  const box = (
    <RadixCheckbox.Root
      id={id}
      aria-describedby={descId}
      aria-invalid={invalid || undefined}
      className={cx(styles.box, !label && className)}
      {...rest}
    >
      <RadixCheckbox.Indicator className={styles.indicator}>
        {rest.checked === "indeterminate" ? (
          <MinusIcon size={14} strokeWidth={2.5} />
        ) : (
          <CheckIcon size={14} strokeWidth={2.5} />
        )}
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );
  if (!label) return box;
  return (
    <div className={cx(styles.row, className)} data-disabled={rest.disabled ? "" : undefined}>
      {box}
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
    </div>
  );
}
