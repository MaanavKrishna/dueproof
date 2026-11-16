import { CheckIcon, ChevronsUpDownIcon } from "@dueproof/icons";
import { Popover as RadixPopover } from "radix-ui";
import { type KeyboardEvent, type ReactNode, useId, useMemo, useRef, useState } from "react";
import shared from "../../styles/shared.module.css";
import { cx } from "../../utils/cx";
import { useControllableState } from "../../utils/use-controllable";
import { Field, type FieldBaseProps } from "../Field/Field";
import fieldStyles from "../Field/Field.module.css";
import styles from "./Combobox.module.css";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Secondary text, e.g. a GSTIN or PAN under a client name. Also searched. */
  description?: string;
  disabled?: boolean;
}

export interface ComboboxProps extends FieldBaseProps {
  options: ComboboxOption[];
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string | null) => void;
  placeholder?: string;
  /** Shown when nothing matches. */
  emptyText?: ReactNode;
  /** Custom matching. Default: case-insensitive "contains" on label and description. */
  filter?: (option: ComboboxOption, query: string) => boolean;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  id?: string;
  name?: string;
  className?: string;
  fieldClassName?: string;
}

const defaultFilter = (o: ComboboxOption, q: string) => {
  const needle = q.trim().toLowerCase();
  return (
    o.label.toLowerCase().includes(needle) ||
    (o.description?.toLowerCase().includes(needle) ?? false)
  );
};

/**
 * A text input that filters a list (ARIA 1.2 combobox with listbox popup).
 * Type to filter, ↑/↓ to move, Enter to choose, Escape to close.
 */
export function Combobox({
  label,
  hideLabel,
  description,
  error,
  optional,
  options,
  value: valueProp,
  defaultValue = null,
  onValueChange,
  placeholder = "Search…",
  emptyText = "No matches",
  filter = defaultFilter,
  disabled = false,
  size = "md",
  id,
  name,
  className,
  fieldClassName,
}: ComboboxProps) {
  const [value, setValue] = useControllableState<string | null>(
    valueProp,
    defaultValue,
    onValueChange,
  );
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listId = `${useId()}-listbox`;

  const selected = options.find((o) => o.value === value) ?? null;
  const filtered = useMemo(
    () => (query ? options.filter((o) => filter(o, query)) : options),
    [options, query, filter],
  );
  const optionId = (i: number) => `${listId}-option-${i}`;

  const firstEnabled = (from: number, step: 1 | -1) => {
    const n = filtered.length;
    for (let k = 0; k < n; k++) {
      const i = (from + step * k + n * 2) % n;
      if (!filtered[i]?.disabled) return i;
    }
    return -1;
  };

  const openList = () => {
    if (disabled) return;
    setOpen(true);
    const current = selected ? filtered.indexOf(selected) : -1;
    setActive(current >= 0 ? current : firstEnabled(0, 1));
  };

  const close = () => {
    setOpen(false);
    setQuery(null);
  };

  const choose = (option: ComboboxOption | undefined) => {
    if (!option || option.disabled) return;
    setValue(option.value);
    close();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) openList();
        else setActive((a) => firstEnabled(a + 1, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) openList();
        else setActive((a) => firstEnabled(a - 1, -1));
        break;
      case "Home":
        if (open) {
          e.preventDefault();
          setActive(firstEnabled(0, 1));
        }
        break;
      case "End":
        if (open) {
          e.preventDefault();
          setActive(firstEnabled(filtered.length - 1, -1));
        }
        break;
      case "Enter":
        if (open) {
          e.preventDefault();
          choose(filtered[active]);
        }
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          close();
        } else if (value !== null) {
          e.preventDefault();
          setValue(null);
        }
        break;
      case "Tab":
        close();
        break;
    }
  };

  const showList = open && !disabled;
  const inputValue = query ?? selected?.label ?? "";

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
        <RadixPopover.Root open={showList} onOpenChange={(o) => (o ? openList() : close())}>
          <RadixPopover.Anchor asChild>
            <div
              ref={anchorRef}
              className={cx(fieldStyles.control, className)}
              data-size={size}
              data-invalid={error ? "" : undefined}
              data-disabled={disabled ? "" : undefined}
            >
              <input
                {...control}
                ref={inputRef}
                name={name}
                role="combobox"
                aria-expanded={showList}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
                autoComplete="off"
                spellCheck={false}
                disabled={disabled}
                placeholder={placeholder}
                value={inputValue}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                  setActive(0);
                }}
                onClick={() => (showList ? undefined : openList())}
                onKeyDown={onKeyDown}
                onBlur={close}
                className={fieldStyles.input}
              />
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                className={styles.toggle}
                disabled={disabled}
                onMouseDown={(e) => {
                  e.preventDefault();
                  inputRef.current?.focus();
                  if (showList) close();
                  else openList();
                }}
              >
                <ChevronsUpDownIcon size={16} />
              </button>
            </div>
          </RadixPopover.Anchor>
          <RadixPopover.Portal>
            <RadixPopover.Content
              align="start"
              sideOffset={4}
              collisionPadding={8}
              onOpenAutoFocus={(e) => e.preventDefault()}
              onCloseAutoFocus={(e) => e.preventDefault()}
              onInteractOutside={(e) => {
                if (anchorRef.current?.contains(e.target as Node)) e.preventDefault();
              }}
              className={cx(shared.floating, styles.content)}
            >
              <div
                id={listId}
                role="listbox"
                aria-label={typeof label === "string" ? label : undefined}
                className={styles.list}
              >
                {filtered.length === 0 ? (
                  <div className={styles.empty}>{emptyText}</div>
                ) : (
                  filtered.map((o, i) => (
                    // biome-ignore lint/a11y/useKeyWithClickEvents: options are driven from the input via aria-activedescendant.
                    <div
                      key={o.value}
                      id={optionId(i)}
                      role="option"
                      tabIndex={-1}
                      aria-selected={i === active}
                      aria-disabled={o.disabled || undefined}
                      data-chosen={o.value === value || undefined}
                      className={cx(shared.item, styles.option)}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseMove={() => (o.disabled ? undefined : setActive(i))}
                      onClick={() => choose(o)}
                    >
                      <span className={styles.check}>
                        {o.value === value ? <CheckIcon size={16} strokeWidth={2} /> : null}
                      </span>
                      <span className={styles.text}>
                        <span>{o.label}</span>
                        {o.description ? (
                          <span className={styles.description}>{o.description}</span>
                        ) : null}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </RadixPopover.Content>
          </RadixPopover.Portal>
        </RadixPopover.Root>
      )}
    </Field>
  );
}
