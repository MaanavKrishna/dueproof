// biome-ignore-all lint/a11y/useSemanticElements: an ARIA grid of days, built from divs.
// biome-ignore-all lint/a11y/useFocusableInteractive: roving focus lives on the day buttons inside the cells.
import {
  CalendarStatutoryIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  HearingIcon,
  type Icon,
  NoticeIcon,
  OrderIcon,
} from "@dueproof/icons";
import { type KeyboardEvent, useEffect, useId, useMemo, useRef } from "react";
import { cx } from "../../utils/cx";
import {
  addDays,
  addMonths,
  type IsoDate,
  longDate,
  monthMatrix,
  monthTitle,
  sameMonth,
  shortDate,
  todayInIST,
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  weekDays,
  weekday,
} from "../../utils/dates";
import { isTypingTarget } from "../../utils/dom";
import { useControllableState } from "../../utils/use-controllable";
import { Button } from "../Button/Button";
import { type DueState, dueLadder } from "../DueChip/DueChip";
import { IconButton } from "../IconButton/IconButton";
import { SegmentedControl } from "../SegmentedControl/SegmentedControl";
import styles from "./Calendar.module.css";

/** The kinds of date that sit together on the calendar (01 §4, Deadlines). */
export type CalendarEventKind = "notice" | "order" | "hearing" | "statutory";

export interface CalendarEvent {
  id: string;
  date: IsoDate;
  /** "Reply to ASMT-10", "GSTR-3B (Oct)". */
  title: string;
  /** Rung of the due ladder: colours the chip, with its icon and word. */
  state: DueState;
  kind?: CalendarEventKind;
  /** Hearings: "11:30". */
  time?: string;
  /** "Harbour Valley Foods". */
  client?: string;
}

export interface CalendarHoliday {
  date: IsoDate;
  name: string;
}

export type CalendarView = "month" | "week";

export interface CalendarProps {
  events: CalendarEvent[];
  holidays?: CalendarHoliday[];
  view?: CalendarView;
  defaultView?: CalendarView;
  onViewChange?: (view: CalendarView) => void;
  /** The focused day (decides the month or week shown). */
  date?: IsoDate;
  defaultDate?: IsoDate;
  onDateChange?: (date: IsoDate) => void;
  /** Today in the org's time zone. Default: today in IST. */
  today?: IsoDate;
  onEventSelect?: (event: CalendarEvent) => void;
  /** Enter on a day, or "+N more". */
  onDaySelect?: (date: IsoDate) => void;
  /** Chips shown per day in month view before "+N more". Default 3. */
  maxPerDay?: number;
  /** Accessible name: "Deadlines calendar". */
  label?: string;
  className?: string;
}

const kindInfo: Record<CalendarEventKind, { icon: Icon; word: string }> = {
  notice: { icon: NoticeIcon, word: "Notice deadline" },
  order: { icon: OrderIcon, word: "Appeal window" },
  hearing: { icon: HearingIcon, word: "Hearing" },
  statutory: { icon: CalendarStatutoryIcon, word: "Statutory filing" },
};

/**
 * Deadlines, hearings and statutory filings by month or week. Chips are
 * coloured by the due ladder and always carry an icon and words; holidays are
 * shaded. Keyboard: arrows move by day, Page Up/Down by month (or week),
 * Home/End to the week's ends, Enter opens the day, Tab reaches its events.
 */
export function Calendar({
  events,
  holidays = [],
  view: viewProp,
  defaultView = "month",
  onViewChange,
  date: dateProp,
  defaultDate,
  onDateChange,
  today: todayProp,
  onEventSelect,
  onDaySelect,
  maxPerDay = 3,
  label = "Calendar",
  className,
}: CalendarProps) {
  const today = todayProp ?? todayInIST();
  const [view, setView] = useControllableState(viewProp, defaultView, onViewChange);
  const [date, setDate] = useControllableState(dateProp, defaultDate ?? today, onDateChange);
  const titleId = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  const keyboardMoved = useRef(false);

  const byDate = useMemo(() => {
    const map = new Map<IsoDate, CalendarEvent[]>();
    for (const e of events) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    for (const list of map.values())
      list.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
    return map;
  }, [events]);
  const holidayMap = useMemo(() => new Map(holidays.map((h) => [h.date, h.name])), [holidays]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: focus follows the focused date after keyboard moves.
  useEffect(() => {
    if (!keyboardMoved.current) return;
    keyboardMoved.current = false;
    gridRef.current?.querySelector<HTMLElement>(`[data-date="${date}"]`)?.focus();
  }, [date, view]);

  const rows: IsoDate[][] = view === "month" ? monthMatrix(date) : [weekDays(date)];
  const title =
    view === "month"
      ? monthTitle(date)
      : (() => {
          const days = weekDays(date);
          return `${shortDate(days[0] ?? date)} – ${shortDate(days[6] ?? date)}`;
        })();

  const step = (dir: 1 | -1) =>
    setDate(view === "month" ? addMonths(date, dir) : addDays(date, 7 * dir));

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (!target.hasAttribute("data-date")) return;
    let next: IsoDate | null = null;
    switch (e.key) {
      case "ArrowLeft":
        next = addDays(date, -1);
        break;
      case "ArrowRight":
        next = addDays(date, 1);
        break;
      case "ArrowUp":
        next = addDays(date, -7);
        break;
      case "ArrowDown":
        next = addDays(date, 7);
        break;
      case "Home":
        next = addDays(date, -weekday(date));
        break;
      case "End":
        next = addDays(date, 6 - weekday(date));
        break;
      case "PageUp":
        next = view === "month" ? addMonths(date, -1) : addDays(date, -7);
        break;
      case "PageDown":
        next = view === "month" ? addMonths(date, 1) : addDays(date, 7);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        onDaySelect?.(date);
        return;
      case "t":
      case "T":
        if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey) return;
        next = today;
        break;
      default:
        return;
    }
    e.preventDefault();
    keyboardMoved.current = true;
    setDate(next);
  };

  return (
    <section
      className={cx(styles.calendar, styles[`view-${view}`], className)}
      aria-labelledby={titleId}
    >
      <header className={styles.header}>
        <h2 id={titleId} className={styles.title} aria-live="polite">
          <span className={styles.srOnly}>{label}, </span>
          {title}
        </h2>
        <div className={styles.nav}>
          <IconButton
            icon={ChevronLeftIcon}
            label={view === "month" ? "Previous month" : "Previous week"}
            size="sm"
            onClick={() => step(-1)}
          />
          <Button size="sm" variant="secondary" onClick={() => setDate(today)}>
            Today
          </Button>
          <IconButton
            icon={ChevronRightIcon}
            label={view === "month" ? "Next month" : "Next week"}
            size="sm"
            onClick={() => step(1)}
          />
        </div>
        <SegmentedControl
          aria-label="View"
          size="sm"
          segments={[
            { value: "month", label: "Month" },
            { value: "week", label: "Week" },
          ]}
          value={view}
          onValueChange={(v) => setView(v as CalendarView)}
        />
      </header>
      <div
        ref={gridRef}
        role="grid"
        aria-labelledby={titleId}
        aria-readonly="true"
        className={styles.grid}
        onKeyDown={onKeyDown}
      >
        <div role="row" className={styles.weekdays}>
          {WEEKDAY_SHORT.map((w, i) => (
            <div
              key={w}
              role="columnheader"
              aria-label={WEEKDAY_LONG[i]}
              className={cx(styles.weekday, i === 6 && styles.sundayHead)}
            >
              {view === "week" ? (
                <>
                  {w} <span className={styles.weekdayDate}>{Number(rows[0]?.[i]?.slice(8))}</span>
                </>
              ) : (
                w
              )}
            </div>
          ))}
        </div>
        {rows.map((week) => (
          <div role="row" key={week[0]} className={styles.weekRow}>
            {week.map((d) => {
              const dayEvents = byDate.get(d) ?? [];
              const holiday = holidayMap.get(d);
              const isFocused = d === date;
              const inMonth = view === "week" || sameMonth(d, date);
              const shown = view === "month" ? dayEvents.slice(0, maxPerDay) : dayEvents;
              const more = dayEvents.length - shown.length;
              const name = [
                longDate(d),
                d === today ? "today" : null,
                holiday ? `holiday: ${holiday}` : null,
                dayEvents.length
                  ? `${dayEvents.length} ${dayEvents.length === 1 ? "item" : "items"}`
                  : "nothing due",
              ]
                .filter(Boolean)
                .join(", ");
              return (
                <div
                  key={d}
                  role="gridcell"
                  aria-selected={isFocused}
                  className={cx(
                    styles.day,
                    !inMonth && styles.outside,
                    holiday && styles.holiday,
                    weekday(d) === 6 && styles.sunday,
                    d === today && styles.today,
                    isFocused && styles.focused,
                  )}
                >
                  <button
                    type="button"
                    data-date={d}
                    tabIndex={isFocused ? 0 : -1}
                    aria-label={name}
                    aria-current={d === today ? "date" : undefined}
                    className={styles.dayButton}
                    onClick={() => setDate(d)}
                    onDoubleClick={() => onDaySelect?.(d)}
                  >
                    <span className={styles.dayNumber}>{Number(d.slice(8))}</span>
                    {holiday ? <span className={styles.holidayName}>{holiday}</span> : null}
                  </button>
                  <ul className={styles.events}>
                    {shown.map((ev) => (
                      <li key={ev.id}>
                        <EventChip
                          event={ev}
                          tabbable={isFocused}
                          detailed={view === "week"}
                          onSelect={onEventSelect}
                        />
                      </li>
                    ))}
                    {more > 0 ? (
                      <li>
                        <button
                          type="button"
                          className={styles.more}
                          tabIndex={isFocused ? 0 : -1}
                          onClick={() => onDaySelect?.(d)}
                        >
                          +{more} more
                        </button>
                      </li>
                    ) : null}
                  </ul>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <ul className={styles.legend} aria-label="Legend">
        {(["overdue", "today", "week", "later", "done"] as DueState[]).map((s) => {
          const LIcon = dueLadder[s].icon;
          return (
            <li key={s} className={cx(styles.legendItem, styles[`due-${s}`])}>
              <LIcon size={12} />
              {dueLadder[s].label}
            </li>
          );
        })}
        <li className={cx(styles.legendItem, styles.legendHoliday)}>Holiday</li>
      </ul>
    </section>
  );
}

function EventChip({
  event,
  tabbable,
  detailed,
  onSelect,
}: {
  event: CalendarEvent;
  tabbable: boolean;
  detailed: boolean;
  onSelect: ((event: CalendarEvent) => void) | undefined;
}) {
  const kind = kindInfo[event.kind ?? "notice"];
  const KIcon = kind.icon;
  const rung = dueLadder[event.state];
  const name = [
    event.title,
    event.client ?? null,
    kind.word,
    rung.label,
    event.time ? `at ${event.time}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <button
      type="button"
      className={cx(styles.chip, styles[`due-${event.state}`], detailed && styles.chipDetailed)}
      tabIndex={tabbable ? 0 : -1}
      aria-label={name}
      title={name}
      onClick={() => onSelect?.(event)}
    >
      <KIcon size={12} strokeWidth={2} className={styles.chipIcon} />
      {event.time ? <span className={styles.chipTime}>{event.time}</span> : null}
      <span className={styles.chipTitle}>{event.title}</span>
      {detailed && event.client ? <span className={styles.chipClient}>{event.client}</span> : null}
    </button>
  );
}
