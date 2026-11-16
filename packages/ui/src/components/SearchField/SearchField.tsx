import { CloseIcon, SearchIcon } from "@dueproof/icons";
import { type ChangeEvent, type ComponentProps, type KeyboardEvent, useRef } from "react";
import { cx } from "../../utils/cx";
import { useControllableState } from "../../utils/use-controllable";
import fieldStyles from "../Field/Field.module.css";
import { Kbd } from "../Kbd/Kbd";
import styles from "./SearchField.module.css";

export interface SearchFieldProps
  extends Omit<ComponentProps<"input">, "size" | "value" | "defaultValue" | "onChange" | "type"> {
  /** Accessible name (search fields usually have no visible label). */
  label?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  /** Called after the clear button or Escape empties the field. */
  onClear?: () => void;
  size?: "sm" | "md" | "lg";
  /** Shortcut hint shown while empty, e.g. ["mod", "K"]. */
  shortcut?: string[];
}

/** Search input with a clear button. Escape clears; a second Escape blurs. */
export function SearchField({
  label = "Search",
  value: valueProp,
  defaultValue = "",
  onValueChange,
  onChange,
  onClear,
  onKeyDown,
  size = "md",
  shortcut,
  placeholder = "Search",
  className,
  disabled,
  ref,
  ...rest
}: SearchFieldProps) {
  const [value, setValue] = useControllableState(valueProp, defaultValue, onValueChange);
  const inner = useRef<HTMLInputElement | null>(null);

  const clear = () => {
    setValue("");
    onClear?.();
    inner.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === "Escape") {
      if (value) {
        e.preventDefault();
        clear();
      } else {
        inner.current?.blur();
      }
    }
  };

  return (
    <div
      className={cx(fieldStyles.control, styles.search, className)}
      data-size={size}
      data-disabled={disabled ? "" : undefined}
    >
      <span className={fieldStyles.adornment}>
        <SearchIcon size={size === "sm" ? 16 : 18} />
      </span>
      <input
        ref={(node) => {
          inner.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        type="search"
        aria-label={label}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        value={value}
        onChange={(e) => {
          onChange?.(e);
          setValue(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        className={cx(fieldStyles.input, styles.input)}
        {...rest}
      />
      {value && !disabled ? (
        <button type="button" className={styles.clear} onClick={clear} aria-label="Clear search">
          <CloseIcon size={14} strokeWidth={2} />
        </button>
      ) : shortcut ? (
        <span className={fieldStyles.adornment} aria-hidden="true">
          <Kbd keys={shortcut} />
        </span>
      ) : null}
    </div>
  );
}
