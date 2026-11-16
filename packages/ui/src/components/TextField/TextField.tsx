import type { Icon } from "@dueproof/icons";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../../utils/cx";
import { Field, type FieldBaseProps } from "../Field/Field";
import fieldStyles from "../Field/Field.module.css";

export interface TextFieldProps extends FieldBaseProps, Omit<ComponentProps<"input">, "size"> {
  size?: "sm" | "md" | "lg";
  /** Icon before the text. */
  icon?: Icon;
  /** Content after the text: a unit, a button, a Kbd. */
  trailing?: ReactNode;
  /** Class for the outer field (label + control). */
  fieldClassName?: string;
}

/** A single-line text input with label, help text and error. */
export function TextField({
  label,
  hideLabel,
  description,
  error,
  optional,
  size = "md",
  icon: LeadingIcon,
  trailing,
  fieldClassName,
  className,
  id,
  disabled,
  type = "text",
  ...rest
}: TextFieldProps) {
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
          {LeadingIcon ? (
            <span className={fieldStyles.adornment}>
              <LeadingIcon size={size === "sm" ? 16 : 18} />
            </span>
          ) : null}
          <input
            {...control}
            type={type}
            disabled={disabled}
            className={fieldStyles.input}
            {...rest}
          />
          {trailing ? <span className={fieldStyles.adornment}>{trailing}</span> : null}
        </div>
      )}
    </Field>
  );
}
