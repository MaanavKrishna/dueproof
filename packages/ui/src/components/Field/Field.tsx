import { AlertIcon } from "@dueproof/icons";
import { type ReactNode, useId } from "react";
import { cx } from "../../utils/cx";
import styles from "./Field.module.css";

/** Props shared by every labelled form control. */
export interface FieldBaseProps {
  /** Visible label. Required for accessibility; use `hideLabel` to hide it visually. */
  label: ReactNode;
  hideLabel?: boolean;
  /** Help text under the control. */
  description?: ReactNode;
  /** Error message. Marks the control invalid and is announced with it. */
  error?: ReactNode;
  /** Adds "(optional)"-style marking: we mark optional fields, not required ones. */
  optional?: boolean;
}

export interface FieldRenderProps {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
}

export interface FieldProps extends FieldBaseProps {
  id?: string | undefined;
  className?: string | undefined;
  /** Receives the ids to put on the control. */
  children: (control: FieldRenderProps) => ReactNode;
  /** Render the label as a <span> (for controls labelled by aria-labelledby). */
  labelAs?: "label" | "span";
  labelId?: string;
}

/** Label, control, description and error, wired together with ids. */
export function Field({
  label,
  hideLabel = false,
  description,
  error,
  optional = false,
  id: idProp,
  className,
  children,
  labelAs = "label",
  labelId,
}: FieldProps) {
  const auto = useId();
  const id = idProp ?? `dp-field-${auto}`;
  const descId = description ? `${id}-description` : undefined;
  const errId = error ? `${id}-error` : undefined;
  const describedBy = [errId, descId].filter(Boolean).join(" ") || undefined;
  const LabelTag = labelAs;
  return (
    <div className={cx(styles.field, className)} data-invalid={error ? "" : undefined}>
      <LabelTag
        id={labelId}
        {...(labelAs === "label" ? { htmlFor: id } : {})}
        className={cx(styles.label, hideLabel && styles.hidden)}
      >
        {label}
        {optional ? <span className={styles.optional}> (optional)</span> : null}
      </LabelTag>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {error ? (
        <p id={errId} className={styles.error}>
          <AlertIcon size={16} />
          <span>{error}</span>
        </p>
      ) : null}
      {description ? (
        <p id={descId} className={styles.description}>
          {description}
        </p>
      ) : null}
    </div>
  );
}
