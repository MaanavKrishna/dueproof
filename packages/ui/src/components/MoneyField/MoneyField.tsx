import { type ComponentProps, useState } from "react";
import { cx } from "../../utils/cx";
import { useControllableState } from "../../utils/use-controllable";
import { Field, type FieldBaseProps } from "../Field/Field";
import fieldStyles from "../Field/Field.module.css";
import styles from "./MoneyField.module.css";
import { formatPaise, paiseToEditable, rupeesToPaise, sanitiseRupeeInput } from "./money";

export interface MoneyFieldProps
  extends FieldBaseProps,
    Omit<ComponentProps<"input">, "value" | "defaultValue" | "onChange" | "size" | "type"> {
  /** Amount in paise (integer). `null` when empty. */
  value?: number | null;
  defaultValue?: number | null;
  /** Called with the amount in paise, or `null` when cleared. */
  onValueChange?: (paise: number | null) => void;
  /** Allow paise (two decimals). Default true. */
  allowPaise?: boolean;
  size?: "sm" | "md" | "lg";
  fieldClassName?: string;
}

/**
 * A rupee amount. Takes and returns integer paise; shows ₹ with Indian
 * grouping (₹4,52,300.50) when not being edited.
 */
export function MoneyField({
  label,
  hideLabel,
  description,
  error,
  optional,
  value: valueProp,
  defaultValue = null,
  onValueChange,
  allowPaise = true,
  size = "md",
  fieldClassName,
  className,
  id,
  disabled,
  placeholder = "0",
  onFocus,
  onBlur,
  ...rest
}: MoneyFieldProps) {
  const [paise, setPaise] = useControllableState<number | null>(
    valueProp,
    defaultValue,
    onValueChange,
  );
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;
  const shown = editing ? draft : paise === null ? "" : formatPaise(paise);

  return (
    <Field
      label={label}
      hideLabel={hideLabel ?? false}
      description={description}
      error={error}
      optional={optional ?? false}
      id={id}
      className={fieldClassName}
    >
      {(control) => (
        <div
          className={cx(fieldStyles.control, className)}
          data-size={size}
          data-invalid={error ? "" : undefined}
          data-disabled={disabled ? "" : undefined}
        >
          <span className={cx(fieldStyles.adornment, styles.currency)} aria-hidden="true">
            ₹
          </span>
          <input
            {...control}
            type="text"
            inputMode={allowPaise ? "decimal" : "numeric"}
            autoComplete="off"
            disabled={disabled}
            placeholder={placeholder}
            value={shown}
            aria-roledescription="amount in rupees"
            onFocus={(e) => {
              setDraft(paise === null ? "" : paiseToEditable(paise));
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setDraft(null);
              onBlur?.(e);
            }}
            onChange={(e) => {
              const next = sanitiseRupeeInput(e.target.value, allowPaise ? 2 : 0);
              setDraft(next);
              const nextPaise = rupeesToPaise(next);
              if (nextPaise !== paise) setPaise(nextPaise);
            }}
            className={cx(fieldStyles.input, styles.input)}
            {...rest}
          />
        </div>
      )}
    </Field>
  );
}
