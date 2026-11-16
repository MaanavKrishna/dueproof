import { CalendarIcon } from "@dueproof/icons";
import { useEffect, useMemo, useState } from "react";
import { cx } from "../../utils/cx";
import { type IsoDate, parseIndianDate, shortDate, todayInIST } from "../../utils/dates";
import { useControllableState } from "../../utils/use-controllable";
import { Field, type FieldBaseProps } from "../Field/Field";
import fieldStyles from "../Field/Field.module.css";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "../Popover/Popover";
import styles from "./DatePicker.module.css";
import { MonthGrid } from "./MonthGrid";

export type DayCountKind = "calendar" | "working";

export interface DateHelper {
  /** Number of days from the reference date. */
  days: number;
  kind: DayCountKind;
  /** Override the button's words. */
  label?: string;
}

/**
 * Turns "N days from a date" into a date. Pass packages/core's date engine:
 * the UI never computes due dates itself (working days need the org's
 * holidays and working-day rules).
 */
export type DateResolver = (from: IsoDate, days: number, kind: DayCountKind) => IsoDate;

export interface DatePickerProps extends FieldBaseProps {
  value?: IsoDate | null;
  defaultValue?: IsoDate | null;
  onValueChange?: (value: IsoDate | null) => void;
  min?: IsoDate;
  max?: IsoDate;
  /** Today in the org's time zone. Default: today in IST. */
  today?: IsoDate;
  /** Holidays to shade: date → name. */
  holidays?: Record<IsoDate, string>;
  /** A reference date for the helpers, e.g. the date of receipt. */
  referenceDate?: IsoDate;
  /** What the reference date is, in words: "receipt" → "30 days from receipt". */
  referenceLabel?: string;
  helpers?: DateHelper[];
  resolveDate?: DateResolver;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  placeholder?: string;
  name?: string;
  className?: string;
}

const defaultHelpers: DateHelper[] = [
  { days: 15, kind: "calendar" },
  { days: 30, kind: "calendar" },
  { days: 7, kind: "working" },
];

/**
 * A date field: type it the Indian way (20/11/2026, 20 Nov 2026) or pick it
 * from a calendar. With a reference date and a resolver it offers helpers
 * such as "30 days from receipt" with a preview of the resulting date.
 */
export function DatePicker({
  label,
  hideLabel,
  description,
  error: errorProp,
  optional,
  value: valueProp,
  defaultValue = null,
  onValueChange,
  min,
  max,
  today: todayProp,
  holidays,
  referenceDate,
  referenceLabel = "receipt",
  helpers = defaultHelpers,
  resolveDate,
  size = "md",
  disabled = false,
  placeholder = "DD/MM/YYYY",
  name,
  className,
}: DatePickerProps) {
  const [value, setValue] = useControllableState<IsoDate | null>(
    valueProp,
    defaultValue,
    onValueChange,
  );
  const today = todayProp ?? todayInIST();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value ? shortDate(value) : "");
  const [typingError, setTypingError] = useState<string | null>(null);
  const [focused, setFocused] = useState<IsoDate>(value ?? today);

  useEffect(() => {
    setText(value ? shortDate(value) : "");
    setTypingError(null);
  }, [value]);

  useEffect(() => {
    if (open) setFocused(value ?? referenceDate ?? today);
  }, [open, value, referenceDate, today]);

  const holidayMap = useMemo(
    () => (holidays ? new Map(Object.entries(holidays)) : undefined),
    [holidays],
  );
  const marked = useMemo(
    () => (referenceDate ? new Map([[referenceDate, `date of ${referenceLabel}`]]) : undefined),
    [referenceDate, referenceLabel],
  );

  const commitText = () => {
    const t = text.trim();
    if (!t) {
      if (value !== null) setValue(null);
      setTypingError(null);
      return;
    }
    const parsed = parseIndianDate(t);
    if (!parsed) {
      setTypingError("Use a date like 20/11/2026 or 20 Nov 2026.");
      return;
    }
    if ((min && parsed < min) || (max && parsed > max)) {
      setTypingError(
        min && parsed < min
          ? `Choose ${shortDate(min)} or later.`
          : `Choose ${shortDate(max ?? parsed)} or earlier.`,
      );
      return;
    }
    setTypingError(null);
    if (parsed !== value) setValue(parsed);
    else setText(shortDate(parsed));
  };

  const pick = (d: IsoDate) => {
    setValue(d);
    setOpen(false);
  };

  const suggestions =
    referenceDate && resolveDate
      ? helpers.map((h) => ({
          ...h,
          result: resolveDate(referenceDate, h.days, h.kind),
        }))
      : [];

  const error = typingError ?? errorProp;

  return (
    <Field
      label={label}
      hideLabel={hideLabel ?? false}
      description={description}
      error={error}
      optional={optional ?? false}
      className={className}
    >
      {(control) => (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverAnchor asChild>
            <div
              className={cx(fieldStyles.control, styles.control)}
              data-size={size}
              data-invalid={error ? "" : undefined}
              data-disabled={disabled ? "" : undefined}
            >
              <input
                {...control}
                name={name}
                className={cx(fieldStyles.input, styles.input)}
                value={text}
                placeholder={placeholder}
                disabled={disabled}
                autoComplete="off"
                inputMode="text"
                onChange={(e) => setText(e.target.value)}
                onBlur={commitText}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitText();
                  }
                  if (e.key === "ArrowDown" && e.altKey) {
                    e.preventDefault();
                    setOpen(true);
                  }
                }}
              />
              {value ? (
                <input type="hidden" name={name ? `${name}-iso` : undefined} value={value} />
              ) : null}
              <PopoverTrigger>
                <button
                  type="button"
                  className={styles.trigger}
                  aria-label={value ? `Change date, ${shortDate(value)}` : "Choose date"}
                  disabled={disabled}
                >
                  <CalendarIcon size={size === "sm" ? 16 : 18} />
                </button>
              </PopoverTrigger>
            </div>
          </PopoverAnchor>
          <PopoverContent
            width="md"
            align="start"
            className={styles.popover}
            aria-label="Choose a date"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <MonthGrid
              focusedDate={focused}
              onFocusedDateChange={setFocused}
              selected={value}
              onSelect={pick}
              today={today}
              min={min}
              max={max}
              holidays={holidayMap}
              marked={marked}
              autoFocus
            />
            {suggestions.length > 0 && referenceDate ? (
              <div className={styles.helpers}>
                <p className={styles.helpersTitle}>
                  From {referenceLabel} · {shortDate(referenceDate)}
                </p>
                <ul className={styles.helperList}>
                  {suggestions.map((s) => (
                    <li key={`${s.days}-${s.kind}`}>
                      <button
                        type="button"
                        className={styles.helper}
                        onClick={() => pick(s.result)}
                      >
                        <span>
                          {s.label ??
                            `${s.days} ${s.kind === "working" ? "working days" : "days"} from ${referenceLabel}`}
                        </span>
                        <span className={styles.helperResult}>{shortDate(s.result)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className={styles.footer}>
              <button type="button" className={styles.link} onClick={() => pick(today)}>
                Today
              </button>
              {value ? (
                <button
                  type="button"
                  className={styles.link}
                  onClick={() => {
                    setValue(null);
                    setOpen(false);
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </Field>
  );
}
