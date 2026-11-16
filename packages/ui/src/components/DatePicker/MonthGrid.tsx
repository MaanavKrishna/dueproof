// biome-ignore-all lint/a11y/noNoninteractiveElementToInteractiveRole: a date table is an ARIA grid (APG date picker pattern).
// biome-ignore-all lint/a11y/useFocusableInteractive: roving focus lives on the day buttons inside the cells.
import { ChevronLeftIcon, ChevronRightIcon } from "@dueproof/icons";
import { type KeyboardEvent, useEffect, useId, useRef } from "react";
import { cx } from "../../utils/cx";
import {
  addDays,
  addMonths,
  type IsoDate,
  longDate,
  monthMatrix,
  monthTitle,
  sameMonth,
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  weekday,
} from "../../utils/dates";
import { IconButton } from "../IconButton/IconButton";
import styles from "./MonthGrid.module.css";

export interface MonthGridProps {
  /** The day that holds keyboard focus (and decides the month shown). */
  focusedDate: IsoDate;
  onFocusedDateChange: (date: IsoDate) => void;
  selected?: IsoDate | null | undefined;
  onSelect: (date: IsoDate) => void;
  today: IsoDate;
  min?: IsoDate | undefined;
  max?: IsoDate | undefined;
  /** Shaded and announced as holidays (still selectable). */
  holidays?: Map<IsoDate, string> | undefined;
  /** Mark these days (e.g. the receipt date). */
  marked?: Map<IsoDate, string> | undefined;
  /** Move DOM focus to the focused day on mount. */
  autoFocus?: boolean;
}

/** A month of days as an ARIA grid: arrows, Page Up/Down, Home/End, Enter. */
export function MonthGrid({
  focusedDate,
  onFocusedDateChange,
  selected,
  onSelect,
  today,
  min,
  max,
  holidays,
  marked,
  autoFocus = false,
}: MonthGridProps) {
  const titleId = useId();
  const gridRef = useRef<HTMLTableElement>(null);
  const moved = useRef(autoFocus);
  const weeks = monthMatrix(focusedDate);

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    gridRef.current?.querySelector<HTMLElement>(`[data-date="${focusedDate}"]`)?.focus();
  }, [focusedDate]);

  const outOfRange = (d: IsoDate) =>
    (min !== undefined && d < min) || (max !== undefined && d > max);

  const move = (d: IsoDate) => {
    moved.current = true;
    onFocusedDateChange(d);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
    const d = focusedDate;
    let next: IsoDate | null = null;
    switch (e.key) {
      case "ArrowLeft":
        next = addDays(d, -1);
        break;
      case "ArrowRight":
        next = addDays(d, 1);
        break;
      case "ArrowUp":
        next = addDays(d, -7);
        break;
      case "ArrowDown":
        next = addDays(d, 7);
        break;
      case "Home":
        next = addDays(d, -weekday(d));
        break;
      case "End":
        next = addDays(d, 6 - weekday(d));
        break;
      case "PageUp":
        next = addMonths(d, e.shiftKey ? -12 : -1);
        break;
      case "PageDown":
        next = addMonths(d, e.shiftKey ? 12 : 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (!outOfRange(d)) onSelect(d);
        return;
      default:
        return;
    }
    e.preventDefault();
    move(next);
  };

  return (
    <div className={styles.month}>
      <div className={styles.header}>
        <h3 id={titleId} className={styles.title} aria-live="polite">
          {monthTitle(focusedDate)}
        </h3>
        <IconButton
          icon={ChevronLeftIcon}
          label="Previous month"
          size="sm"
          tooltip={false}
          onClick={() => onFocusedDateChange(addMonths(focusedDate, -1))}
        />
        <IconButton
          icon={ChevronRightIcon}
          label="Next month"
          size="sm"
          tooltip={false}
          onClick={() => onFocusedDateChange(addMonths(focusedDate, 1))}
        />
      </div>
      <table
        ref={gridRef}
        role="grid"
        aria-labelledby={titleId}
        className={styles.grid}
        onKeyDown={onKeyDown}
      >
        <thead>
          <tr>
            {WEEKDAY_SHORT.map((w, i) => (
              <th key={w} scope="col" abbr={WEEKDAY_LONG[i]} className={styles.weekday}>
                {w.slice(0, 2)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((d) => {
                const inMonth = sameMonth(d, focusedDate);
                const isSelected = selected === d;
                const isToday = today === d;
                const holiday = holidays?.get(d);
                const mark = marked?.get(d);
                const disabled = outOfRange(d);
                const label = [
                  longDate(d),
                  isToday ? "today" : null,
                  holiday ? `holiday: ${holiday}` : null,
                  mark ?? null,
                ]
                  .filter(Boolean)
                  .join(", ");
                return (
                  <td
                    key={d}
                    role="gridcell"
                    aria-selected={isSelected}
                    aria-disabled={disabled || undefined}
                    className={styles.cell}
                  >
                    <button
                      type="button"
                      data-date={d}
                      tabIndex={d === focusedDate ? 0 : -1}
                      aria-label={label}
                      aria-current={isToday ? "date" : undefined}
                      disabled={disabled}
                      className={cx(
                        styles.day,
                        !inMonth && styles.outside,
                        isSelected && styles.selected,
                        isToday && styles.today,
                        holiday && styles.holiday,
                        weekday(d) === 6 && styles.sunday,
                        mark && styles.marked,
                      )}
                      onClick={() => {
                        onFocusedDateChange(d);
                        onSelect(d);
                      }}
                    >
                      {Number(d.slice(8))}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
