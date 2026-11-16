import { CheckIcon, ChevronDownIcon, ChevronsUpDownIcon, ChevronUpIcon } from "@dueproof/icons";
import { Select as RadixSelect } from "radix-ui";
import { useId } from "react";
import shared from "../../styles/shared.module.css";
import { cx } from "../../utils/cx";
import { Field, type FieldBaseProps } from "../Field/Field";
import fieldStyles from "../Field/Field.module.css";
import styles from "./Select.module.css";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectGroup {
  label: string;
  options: SelectOption[];
}

export interface SelectProps extends FieldBaseProps {
  options: Array<SelectOption | SelectGroup>;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  size?: "sm" | "md" | "lg";
  id?: string;
  className?: string;
  fieldClassName?: string;
}

const isGroup = (o: SelectOption | SelectGroup): o is SelectGroup => "options" in o;

/** Pick one value from a short list (up to ~15). Use Combobox for long or searchable lists. */
export function Select({
  label,
  hideLabel,
  description,
  error,
  optional,
  options,
  placeholder = "Choose…",
  size = "md",
  id,
  className,
  fieldClassName,
  disabled,
  ...rootProps
}: SelectProps) {
  const labelId = `${useId()}-label`;
  return (
    <Field
      label={label}
      hideLabel={hideLabel ?? false}
      description={description}
      error={error}
      optional={optional ?? false}
      id={id}
      className={fieldClassName}
      labelId={labelId}
    >
      {(control) => (
        <RadixSelect.Root disabled={disabled ?? false} {...rootProps}>
          <RadixSelect.Trigger
            {...control}
            aria-labelledby={labelId}
            className={cx(fieldStyles.control, styles.trigger, className)}
            data-size={size}
            data-invalid={error ? "" : undefined}
            data-disabled={disabled ? "" : undefined}
          >
            <span className={styles.value}>
              <RadixSelect.Value placeholder={placeholder} />
            </span>
            <RadixSelect.Icon className={fieldStyles.adornment}>
              <ChevronsUpDownIcon size={16} />
            </RadixSelect.Icon>
          </RadixSelect.Trigger>
          <RadixSelect.Portal>
            <RadixSelect.Content
              position="popper"
              sideOffset={4}
              collisionPadding={8}
              className={cx(shared.floating, styles.content)}
            >
              <RadixSelect.ScrollUpButton className={styles.scroll}>
                <ChevronUpIcon size={16} />
              </RadixSelect.ScrollUpButton>
              <RadixSelect.Viewport className={styles.viewport}>
                {options.map((o) =>
                  isGroup(o) ? (
                    <RadixSelect.Group key={o.label}>
                      <RadixSelect.Label className={styles.groupLabel}>{o.label}</RadixSelect.Label>
                      {o.options.map((opt) => (
                        <Item key={opt.value} option={opt} />
                      ))}
                    </RadixSelect.Group>
                  ) : (
                    <Item key={o.value} option={o} />
                  ),
                )}
              </RadixSelect.Viewport>
              <RadixSelect.ScrollDownButton className={styles.scroll}>
                <ChevronDownIcon size={16} />
              </RadixSelect.ScrollDownButton>
            </RadixSelect.Content>
          </RadixSelect.Portal>
        </RadixSelect.Root>
      )}
    </Field>
  );
}

function Item({ option }: { option: SelectOption }) {
  return (
    <RadixSelect.Item
      value={option.value}
      disabled={option.disabled ?? false}
      className={cx(shared.item, styles.item)}
    >
      <RadixSelect.ItemIndicator className={styles.check}>
        <CheckIcon size={16} strokeWidth={2} />
      </RadixSelect.ItemIndicator>
      <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
    </RadixSelect.Item>
  );
}
