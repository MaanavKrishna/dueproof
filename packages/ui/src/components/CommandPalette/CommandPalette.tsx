import { type Icon, SearchIcon } from "@dueproof/icons";
import { Dialog as RadixDialog } from "radix-ui";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, fade, MotionFeatures, m, standard, useReducedMotion } from "../../motion";
import { cx } from "../../utils/cx";
import { useControllableState } from "../../utils/use-controllable";
import { Kbd } from "../Kbd/Kbd";
import styles from "./CommandPalette.module.css";
import { type FuzzyMatch, fuzzyScore } from "./fuzzy";

export interface Command {
  id: string;
  label: string;
  /** Group heading: "Go to", "Actions", "Clients", "Notices". */
  group?: string;
  icon?: Icon;
  /** Shortcut keys shown on the right, e.g. ["G", "T"] or ["mod", "U"]. */
  shortcut?: string[];
  /** Other words that should find this command (not shown). */
  keywords?: string[];
  /** A second line, e.g. a client's GSTIN. */
  description?: string;
  disabled?: boolean;
  onSelect: () => void;
}

export interface CommandPaletteProps {
  commands: Command[];
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Ids of recently run commands, newest first. Shown when the query is empty. */
  recentIds?: string[];
  onRecentIdsChange?: (ids: string[]) => void;
  /** Listen for ⌘K / Ctrl K anywhere. Default true. */
  hotkey?: boolean;
  placeholder?: string;
  /** Shown when nothing matches. */
  emptyMessage?: ReactNode;
  /** Order of groups (others follow in first-seen order). */
  groupOrder?: string[];
  /** Called as the query changes, e.g. to load matching notices from the server. */
  onQueryChange?: (query: string) => void;
  /** At most this many results per group while searching. Default 8. */
  maxPerGroup?: number;
}

interface Row {
  command: Command;
  match: FuzzyMatch;
  group: string;
  key: string;
}

const RECENT = "Recent";

/**
 * ⌘K / Ctrl K: jump anywhere, find anything, run any action. Type to filter
 * (fuzzy), ↑/↓ to move, Enter to run, Escape to close.
 */
export function CommandPalette({
  commands,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  recentIds: recentProp,
  onRecentIdsChange,
  hotkey = true,
  placeholder = "Search or jump to…",
  emptyMessage = "No matches. Try a client name, a reference or an action.",
  groupOrder = [],
  onQueryChange,
  maxPerGroup = 8,
}: CommandPaletteProps) {
  const [open, setOpen] = useControllableState(openProp, defaultOpen, onOpenChange);
  const [recentIds, setRecentIds] = useControllableState(recentProp, [], onRecentIdsChange);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const reduce = useReducedMotion();
  const listRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (!hotkey) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!openRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hotkey, setOpen]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const rows = useMemo<Row[]>(() => {
    const byId = new Map(commands.map((c) => [c.id, c]));
    const out: Row[] = [];
    const q = query.trim();
    if (!q) {
      for (const id of recentIds) {
        const c = byId.get(id);
        if (c)
          out.push({ command: c, match: { score: 0, indexes: [] }, group: RECENT, key: `r-${id}` });
      }
    }
    const scored: Row[] = [];
    for (const c of commands) {
      const match = fuzzyScore(q, c.label, [...(c.keywords ?? []), c.description ?? ""]);
      if (match) scored.push({ command: c, match, group: c.group ?? "Commands", key: c.id });
    }
    // Group order: explicit order first, then first-seen order.
    const groups: string[] = [...groupOrder];
    for (const r of scored) if (!groups.includes(r.group)) groups.push(r.group);
    for (const g of groups) {
      const inGroup = scored.filter((r) => r.group === g);
      if (q) inGroup.sort((a, b) => b.match.score - a.match.score);
      out.push(...(q ? inGroup.slice(0, maxPerGroup) : inGroup));
    }
    if (q) {
      // While searching, groups are ordered by their best match.
      const best = new Map<string, number>();
      for (const r of out)
        best.set(r.group, Math.max(best.get(r.group) ?? -Infinity, r.match.score));
      const order = [...best.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
      out.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
    }
    return out;
  }, [commands, query, recentIds, groupOrder, maxPerGroup]);

  const enabled = rows.map((r, i) => (r.command.disabled ? -1 : i)).filter((i) => i >= 0);
  const activeIndex = enabled.includes(active) ? active : (enabled[0] ?? -1);
  const optionId = (i: number) => `${listId}-opt-${i}`;

  useEffect(() => {
    if (activeIndex < 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const run = (row: Row | undefined) => {
    if (!row || row.command.disabled) return;
    setRecentIds([row.command.id, ...recentIds.filter((id) => id !== row.command.id)].slice(0, 5));
    setOpen(false);
    row.command.onSelect();
  };

  const move = (delta: number) => {
    if (enabled.length === 0) return;
    const pos = enabled.indexOf(activeIndex);
    const next = enabled[(pos + delta + enabled.length) % enabled.length];
    if (next !== undefined) setActive(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          setActive(enabled[0] ?? 0);
        }
        break;
      case "End":
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          setActive(enabled[enabled.length - 1] ?? 0);
        }
        break;
      case "Enter":
        e.preventDefault();
        run(rows[activeIndex]);
        break;
    }
  };

  // Render rows under group headings.
  const sections: { group: string; items: { row: Row; index: number }[] }[] = [];
  rows.forEach((row, index) => {
    const last = sections[sections.length - 1];
    if (last && last.group === row.group) last.items.push({ row, index });
    else sections.push({ group: row.group, items: [{ row, index }] });
  });

  return (
    <RadixDialog.Root open={open} onOpenChange={setOpen}>
      <MotionFeatures>
        <AnimatePresence>
          {open ? (
            <RadixDialog.Portal forceMount>
              <RadixDialog.Overlay asChild forceMount>
                <m.div
                  className={styles.overlay}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={fade}
                />
              </RadixDialog.Overlay>
              <div className={styles.positioner}>
                <RadixDialog.Content asChild forceMount aria-describedby={undefined}>
                  <m.div
                    className={styles.palette}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: -8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                    transition={reduce ? fade : standard}
                  >
                    <RadixDialog.Title className={styles.srOnly}>Command palette</RadixDialog.Title>
                    <div className={styles.inputRow}>
                      <SearchIcon size={20} className={styles.searchIcon} />
                      <input
                        className={styles.input}
                        role="combobox"
                        aria-expanded="true"
                        aria-controls={listId}
                        aria-autocomplete="list"
                        aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
                        aria-label="Search commands"
                        placeholder={placeholder}
                        value={query}
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(e) => {
                          setQuery(e.target.value);
                          setActive(0);
                          onQueryChange?.(e.target.value);
                        }}
                        onKeyDown={onKeyDown}
                      />
                      <Kbd>esc</Kbd>
                    </div>
                    <div
                      ref={listRef}
                      id={listId}
                      role="listbox"
                      aria-label="Results"
                      className={styles.list}
                    >
                      {rows.length === 0 ? (
                        <p className={styles.empty} role="status">
                          {emptyMessage}
                        </p>
                      ) : (
                        sections.map((section) => (
                          // biome-ignore lint/a11y/useSemanticElements: an ARIA group inside a listbox.
                          <div
                            key={section.group}
                            role="group"
                            aria-labelledby={`${listId}-${section.group}`}
                            className={styles.group}
                          >
                            <div
                              id={`${listId}-${section.group}`}
                              className={styles.groupTitle}
                              role="presentation"
                            >
                              {section.group}
                            </div>
                            {section.items.map(({ row, index }) => (
                              <Option
                                key={row.key}
                                id={optionId(index)}
                                index={index}
                                row={row}
                                active={index === activeIndex}
                                onHover={() => !row.command.disabled && setActive(index)}
                                onRun={() => run(row)}
                              />
                            ))}
                          </div>
                        ))
                      )}
                    </div>
                    <footer className={styles.footer} aria-hidden="true">
                      <span>
                        <Kbd>↑</Kbd>
                        <Kbd>↓</Kbd> to move
                      </span>
                      <span>
                        <Kbd keys={["enter"]} /> to run
                      </span>
                      <span>
                        <Kbd keys={["mod", "K"]} /> to open or close
                      </span>
                    </footer>
                  </m.div>
                </RadixDialog.Content>
              </div>
            </RadixDialog.Portal>
          ) : null}
        </AnimatePresence>
      </MotionFeatures>
    </RadixDialog.Root>
  );
}

function Option({
  id,
  index,
  row,
  active,
  onHover,
  onRun,
}: {
  id: string;
  index: number;
  row: Row;
  active: boolean;
  onHover: () => void;
  onRun: () => void;
}) {
  const { command, match } = row;
  const ItemIcon = command.icon;
  return (
    // biome-ignore lint/a11y/useFocusableInteractive: options are reached with aria-activedescendant from the input.
    // biome-ignore lint/a11y/useKeyWithClickEvents: the input handles Enter for the active option.
    <div
      id={id}
      role="option"
      aria-selected={active}
      aria-disabled={command.disabled || undefined}
      data-index={index}
      className={cx(styles.option, active && styles.active)}
      onMouseMove={onHover}
      onClick={onRun}
    >
      <span className={styles.optionIcon}>{ItemIcon ? <ItemIcon size={18} /> : null}</span>
      <span className={styles.optionText}>
        <span className={styles.optionLabel}>
          <Highlighted text={command.label} indexes={match.indexes} />
        </span>
        {command.description ? (
          <span className={styles.optionDescription}>{command.description}</span>
        ) : null}
      </span>
      {command.shortcut ? <Kbd keys={command.shortcut} className={styles.shortcut} /> : null}
    </div>
  );
}

function Highlighted({ text, indexes }: { text: string; indexes: number[] }) {
  if (indexes.length === 0) return <>{text}</>;
  const set = new Set(indexes);
  const parts: { text: string; hit: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const hit = set.has(i);
    const last = parts[parts.length - 1];
    if (last && last.hit === hit) last.text += text[i];
    else parts.push({ text: text[i] ?? "", hit });
  }
  return (
    <>
      {parts.map((p, i) =>
        p.hit ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: static split of one string
          <mark key={i} className={styles.mark}>
            {p.text}
          </mark>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: static split of one string
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}
