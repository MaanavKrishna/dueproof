import type { ComponentProps, CSSProperties } from "react";
import { cx } from "../../utils/cx";
import { Field, type FieldBaseProps } from "../Field/Field";
import fieldStyles from "../Field/Field.module.css";
import styles from "./TextArea.module.css";

export interface TextAreaProps extends FieldBaseProps, ComponentProps<"textarea"> {
  /** Grow with the content (where the browser supports it), between `rows` and `maxRows`. */
  autoGrow?: boolean;
  maxRows?: number;
  fieldClassName?: string;
}

/** Multi-line text input. */
export function TextArea({
  label,
  hideLabel,
  description,
  error,
  optional,
  autoGrow = true,
  rows = 3,
  maxRows = 12,
  fieldClassName,
  className,
  id,
  disabled,
  style,
  ...rest
}: TextAreaProps) {
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
          className={cx(fieldStyles.control, styles.wrap, className)}
          data-invalid={error ? "" : undefined}
          data-disabled={disabled ? "" : undefined}
        >
          <textarea
            {...control}
            rows={rows}
            disabled={disabled}
            className={cx(fieldStyles.input, styles.textarea, autoGrow && styles.autoGrow)}
            style={
              {
                ...style,
                "--dp-textarea-min-rows": rows,
                "--dp-textarea-max-rows": maxRows,
              } as CSSProperties
            }
            {...rest}
          />
        </div>
      )}
    </Field>
  );
}
