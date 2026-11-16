// biome-ignore-all lint/a11y/useSemanticElements: ARIA grid/listbox built from divs (virtualised), with roving focus.
// biome-ignore-all lint/a11y/useFocusableInteractive: ARIA grid/listbox built from divs (virtualised), with roving focus.
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CloseIcon,
  ColumnsIcon,
  ErrorIcon,
  SearchIcon,
} from "@dueproof/icons";
import {
  type ColumnDef,
  type ColumnVisibilityState,
  columnVisibilityFeature,
  createSortedRowModel,
  type RowData,
  type RowSelectionState,
  rowSelectionFeature,
  rowSortingFeature,
  type SortingState,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, MotionFeatures, m, standard, variants } from "../../motion";
import { cx } from "../../utils/cx";
import { useTokenPx } from "../../utils/dom";
import { useControllableState } from "../../utils/use-controllable";
import { Button } from "../Button/Button";
import { Checkbox } from "../Checkbox/Checkbox";
import { EmptyState } from "../EmptyState/EmptyState";
import { Menu, MenuCheckboxItem, MenuContent, MenuLabel, MenuTrigger } from "../Menu/Menu";
import { Skeleton } from "../Skeleton/Skeleton";
import styles from "./DataTable.module.css";

export type ColumnWidth = "xs" | "sm" | "md" | "lg" | "xl" | "fill";
export type SortValue = string | number | bigint | null | undefined;

export interface DataTableColumn<T> {
  id: string;
  /** Column heading (also the column chooser's label). */
  header: string;
  /** The value used for sorting, and for the cell when `cell` is omitted. */
  accessor?: (row: T) => SortValue;
  /** Renders the cell. Defaults to the accessor's value. */
  cell?: (row: T) => ReactNode;
  width?: ColumnWidth;
  /** Numbers and amounts align to the end. */
  align?: "start" | "center" | "end";
  /** Default: true when there's an accessor. */
  sortable?: boolean;
  /** Can be hidden from the column chooser. Default true. */
  hideable?: boolean;
  /** Hidden until chosen. */
  defaultHidden?: boolean;
  /** Put empty values first or last when sorting. Default last. */
  emptyFirst?: boolean;
}

export interface DataTableSort {
  id: string;
  desc: boolean;
}

export interface DataTableError {
  title: ReactNode;
  description?: ReactNode;
  onRetry?: () => void;
}

export interface DataTableProps<T extends RowData> {
  /** Accessible name of the grid, e.g. "Notices". */
  label: string;
  columns: DataTableColumn<T>[];
  data: T[];
  /** Stable id for each row (never the index). */
  getRowId: (row: T) => string;
  /** Called on click or Enter. Open the record or its inspector. */
  onRowClick?: (row: T) => void;
  /** The row whose record is open (e.g. in the inspector). */
  activeRowId?: string | undefined;
  /** Show checkboxes and allow selecting rows (Space, Shift-click for ranges). */
  selectable?: boolean;
  selectedIds?: string[];
  defaultSelectedIds?: string[];
  onSelectedIdsChange?: (ids: string[]) => void;
  /** Actions for the selected rows, shown in a bar at the bottom. */
  bulkActions?: (selected: { ids: string[]; rows: T[]; clear: () => void }) => ReactNode;
  sorting?: DataTableSort[];
  defaultSorting?: DataTableSort[];
  onSortingChange?: (sorting: DataTableSort[]) => void;
  /** The server sorts: rows arrive in order and are not re-sorted here. */
  manualSorting?: boolean;
  hiddenColumns?: string[];
  onHiddenColumnsChange?: (ids: string[]) => void;
  /** Show the column chooser at the end of the header. Default true. */
  columnChooser?: boolean;
  loading?: boolean;
  error?: DataTableError | null;
  /** What to show with no rows (an <EmptyState>). */
  empty?: ReactNode;
  /** Height of the scrolling area. Default fills the parent. */
  height?: string;
  /** Rows rendered beyond the visible area. Default 8. */
  overscan?: number;
  className?: string;
}

const widthTrack: Record<ColumnWidth, string> = {
  xs: "minmax(var(--dp-space-64), 0.5fr)",
  sm: "minmax(var(--dp-space-96), 0.8fr)",
  md: "minmax(calc(var(--dp-space-96) * 1.4), 1fr)",
  lg: "minmax(calc(var(--dp-space-96) * 1.8), 1.4fr)",
  xl: "minmax(calc(var(--dp-space-96) * 2.4), 2fr)",
  fill: "minmax(calc(var(--dp-space-96) * 2.2), 3fr)",
};
const widthMin: Record<ColumnWidth, string> = {
  xs: "var(--dp-space-64)",
  sm: "var(--dp-space-96)",
  md: "calc(var(--dp-space-96) * 1.4)",
  lg: "calc(var(--dp-space-96) * 1.8)",
  xl: "calc(var(--dp-space-96) * 2.4)",
  fill: "calc(var(--dp-space-96) * 2.2)",
};
const fixedTrack = "var(--dp-size-control-md)";

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  rowSelectionFeature,
  columnVisibilityFeature,
});
type Features = typeof features;

function compareValues(a: SortValue, b: SortValue): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "bigint" && typeof b === "bigint") return a < b ? -1 : a > b ? 1 : 0;
  return String(a).localeCompare(String(b), "en-IN", { numeric: true, sensitivity: "base" });
}

function isEmpty(v: SortValue): boolean {
  return v === null || v === undefined || v === "";
}

function toSelection(ids: string[]): RowSelectionState {
  return Object.fromEntries(ids.map((id) => [id, true]));
}

/** Where keyboard focus sits in the grid. Row -1 is the header row. */
interface CellPos {
  row: number;
  col: number;
}

/**
 * The register's table: virtualised (thousands of rows), sticky header,
 * sorting, column chooser, row selection with a bulk-actions bar, and full
 * keyboard navigation (arrow keys, Home/End, Page Up/Down, Space selects,
 * Enter opens). Row height follows density.
 */
export function DataTable<T extends RowData>({
  label,
  columns,
  data,
  getRowId,
  onRowClick,
  activeRowId,
  selectable = false,
  selectedIds: selectedProp,
  defaultSelectedIds = [],
  onSelectedIdsChange,
  bulkActions,
  sorting: sortingProp,
  defaultSorting = [],
  onSortingChange,
  manualSorting = false,
  hiddenColumns: hiddenProp,
  onHiddenColumnsChange,
  columnChooser = true,
  loading = false,
  error = null,
  empty,
  height,
  overscan = 8,
  className,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useControllableState<DataTableSort[]>(
    sortingProp,
    defaultSorting,
    onSortingChange,
  );
  const [selectedIds, setSelectedIds] = useControllableState(
    selectedProp,
    defaultSelectedIds,
    onSelectedIdsChange,
  );
  const defaultHidden = useMemo(
    () => columns.filter((c) => c.defaultHidden).map((c) => c.id),
    [columns],
  );
  const [hidden, setHidden] = useControllableState(
    hiddenProp,
    defaultHidden,
    onHiddenColumnsChange,
  );

  const tableColumns = useMemo<ColumnDef<Features, T>[]>(
    () =>
      columns.map((c) => {
        const accessor = c.accessor;
        const def: ColumnDef<Features, T, SortValue> = accessor
          ? {
              id: c.id,
              header: c.header,
              // Empty values become undefined so they stay last (or first) in both directions.
              accessorFn: (row: T) => {
                const v = accessor(row);
                return isEmpty(v) ? undefined : v;
              },
              enableSorting: c.sortable ?? true,
              enableHiding: c.hideable ?? true,
              sortUndefined: c.emptyFirst ? "first" : "last",
              sortFn: (a, b, id) =>
                compareValues(a.getValue<SortValue>(id), b.getValue<SortValue>(id)),
            }
          : {
              id: c.id,
              header: c.header,
              enableSorting: false,
              enableHiding: c.hideable ?? true,
            };
        return def as ColumnDef<Features, T>;
      }),
    [columns],
  );

  const rowSelection = useMemo(() => toSelection(selectedIds), [selectedIds]);
  const columnVisibility = useMemo<ColumnVisibilityState>(
    () => Object.fromEntries(hidden.map((id) => [id, false])),
    [hidden],
  );
  const tableSorting = sorting as SortingState;

  const table = useTable({
    features,
    columns: tableColumns,
    data,
    getRowId: (row: T) => getRowId(row),
    manualSorting,
    enableMultiSort: false,
    sortDescFirst: false,
    enableRowSelection: selectable,
    state: { sorting: tableSorting, rowSelection, columnVisibility },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(tableSorting) : updater;
      setSorting(next.map((s) => ({ id: s.id, desc: s.desc })));
    },
    onRowSelectionChange: (updater) => {
      const next = typeof updater === "function" ? updater(rowSelection) : updater;
      setSelectedIds(Object.keys(next).filter((k) => next[k]));
    },
    onColumnVisibilityChange: (updater) => {
      const next = typeof updater === "function" ? updater(columnVisibility) : updater;
      setHidden(Object.keys(next).filter((k) => next[k] === false));
    },
  });

  const rows = table.getRowModel().rows;
  const visibleColumns = columns.filter((c) => !hidden.includes(c.id));
  const byId = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);

  // Grid geometry.
  const tracks = [
    ...(selectable ? [fixedTrack] : []),
    ...visibleColumns.map((c) => widthTrack[c.width ?? "md"]),
    ...(columnChooser ? [fixedTrack] : []),
  ];
  const mins = [
    ...(selectable ? [fixedTrack] : []),
    ...visibleColumns.map((c) => widthMin[c.width ?? "md"]),
    ...(columnChooser ? [fixedTrack] : []),
  ];
  const gridStyle = {
    "--dp-table-columns": tracks.join(" "),
    "--dp-table-min": `calc(${mins.join(" + ")})`,
    ...(height ? { height } : {}),
  } as CSSProperties;
  const colCount = tracks.length;
  const firstDataCol = selectable ? 1 : 0;

  // Virtual rows: height follows the density token.
  const rowHeight = useTokenPx("--dp-size-row", 48);
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    getItemKey: (index) => rows[index]?.id ?? index,
    overscan,
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the density token changes the row height.
  useLayoutEffect(() => {
    virtualizer.measure();
  }, [rowHeight, virtualizer]);

  // Roving focus.
  const [focus, setFocus] = useState<CellPos>({ row: rows.length ? 0 : -1, col: firstDataCol });
  const pendingFocus = useRef(false);
  const maxRow = rows.length - 1;
  const clamp = useCallback(
    (p: CellPos): CellPos => ({
      row: Math.max(-1, Math.min(maxRow, p.row)),
      col: Math.max(0, Math.min(colCount - 1, p.col)),
    }),
    [maxRow, colCount],
  );
  const safeFocus = clamp(focus);

  const moveTo = (p: CellPos) => {
    const next = clamp(p);
    pendingFocus.current = true;
    setFocus(next);
    if (next.row >= 0) virtualizer.scrollToIndex(next.row, { align: "auto" });
    else if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  useEffect(() => {
    if (!pendingFocus.current) return;
    const find = () =>
      scrollRef.current?.querySelector<HTMLElement>(
        `[data-row="${safeFocus.row}"][data-col="${safeFocus.col}"]`,
      );
    const el = find();
    if (el) {
      pendingFocus.current = false;
      el.focus({ preventScroll: safeFocus.row < 0 });
      return;
    }
    const raf = requestAnimationFrame(() => {
      const later = find();
      if (later) {
        pendingFocus.current = false;
        later.focus();
      }
    });
    return () => cancelAnimationFrame(raf);
  });

  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);
  const clearSelection = () => setSelectedIds([]);
  const allSelected =
    rows.length > 0 && selectedIds.length >= rows.length && table.getIsAllRowsSelected();
  const someSelected = selectedIds.length > 0 && !allSelected;

  const pageSize = Math.max(
    1,
    Math.floor((scrollRef.current?.clientHeight ?? rowHeight * 10) / rowHeight) - 1,
  );

  const onGridKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Let menus, inputs and buttons inside cells handle their own keys.
    const target = e.target as HTMLElement;
    if (!target.hasAttribute("data-col")) return;
    const { row, col } = safeFocus;
    const mod = e.ctrlKey || e.metaKey;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveTo({ row: row + 1, col });
        return;
      case "ArrowUp":
        e.preventDefault();
        moveTo({ row: row - 1, col });
        return;
      case "ArrowRight":
        e.preventDefault();
        moveTo({ row, col: col + 1 });
        return;
      case "ArrowLeft":
        e.preventDefault();
        moveTo({ row, col: col - 1 });
        return;
      case "Home":
        e.preventDefault();
        moveTo(mod ? { row: 0, col: 0 } : { row, col: 0 });
        return;
      case "End":
        e.preventDefault();
        moveTo(mod ? { row: maxRow, col: colCount - 1 } : { row, col: colCount - 1 });
        return;
      case "PageDown":
        e.preventDefault();
        moveTo({ row: row + pageSize, col });
        return;
      case "PageUp":
        e.preventDefault();
        moveTo({ row: Math.max(0, row - pageSize), col });
        return;
      case "a":
      case "A":
        if (mod && selectable) {
          e.preventDefault();
          table.toggleAllRowsSelected(!allSelected);
        }
        return;
      case "Escape":
        if (selectable && selectedIds.length) {
          e.preventDefault();
          clearSelection();
        }
        return;
      case " ":
      case "Enter": {
        if (row < 0) {
          const colDef = headerColumn(col);
          if (colDef === "select" && selectable) {
            e.preventDefault();
            table.toggleAllRowsSelected(!allSelected);
          } else if (colDef && colDef !== "select" && colDef !== "chooser") {
            const column = table.getColumn(colDef.id);
            if (column?.getCanSort()) {
              e.preventDefault();
              column.toggleSorting();
            }
          } else if (colDef === "chooser") {
            e.preventDefault();
            target.querySelector<HTMLElement>("button")?.click();
          }
          return;
        }
        const r = rows[row];
        if (!r) return;
        if (e.key === " " && selectable) {
          e.preventDefault();
          r.getToggleSelectedHandler()(e);
        } else if (e.key === "Enter" && onRowClick) {
          e.preventDefault();
          onRowClick(r.original);
        }
        return;
      }
    }
  };

  const headerColumn = (col: number): DataTableColumn<T> | "select" | "chooser" | undefined => {
    if (selectable && col === 0) return "select";
    if (columnChooser && col === colCount - 1) return "chooser";
    return visibleColumns[col - firstDataCol];
  };

  const tabIndexFor = (row: number, col: number) =>
    safeFocus.row === row && safeFocus.col === col ? 0 : -1;

  const liveId = useId();
  const showBody = !loading && !error && rows.length > 0;

  return (
    <div className={cx(styles.wrapper, className)} style={gridStyle}>
      <div
        ref={scrollRef}
        className={styles.scroll}
        role="grid"
        aria-label={label}
        aria-rowcount={rows.length + 1}
        aria-colcount={colCount}
        aria-multiselectable={selectable || undefined}
        aria-busy={loading || undefined}
        aria-describedby={liveId}
        onKeyDown={onGridKeyDown}
      >
        <div role="rowgroup" className={styles.head}>
          <div role="row" aria-rowindex={1} className={styles.headRow}>
            {selectable ? (
              <div
                role="columnheader"
                aria-colindex={1}
                className={cx(styles.headCell, styles.selectCell)}
                data-row={-1}
                data-col={0}
                tabIndex={tabIndexFor(-1, 0)}
                onFocus={() => setFocus({ row: -1, col: 0 })}
              >
                <Checkbox
                  aria-label={allSelected ? "Deselect all rows" : "Select all rows"}
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={(c) => table.toggleAllRowsSelected(c === true)}
                  tabIndex={-1}
                  disabled={rows.length === 0}
                />
              </div>
            ) : null}
            {visibleColumns.map((c, i) => {
              const column = table.getColumn(c.id);
              const canSort = Boolean(c.accessor) && (c.sortable ?? true);
              const dir = column?.getIsSorted() ?? false;
              const colIndex = i + firstDataCol;
              return (
                // biome-ignore lint/a11y/useKeyWithClickEvents: the grid handles Enter and Space.
                <div
                  key={c.id}
                  role="columnheader"
                  aria-colindex={colIndex + 1}
                  aria-sort={
                    canSort
                      ? dir === "asc"
                        ? "ascending"
                        : dir === "desc"
                          ? "descending"
                          : "none"
                      : undefined
                  }
                  className={cx(
                    styles.headCell,
                    canSort && styles.sortable,
                    c.align === "end" && styles.alignEnd,
                    c.align === "center" && styles.alignCenter,
                  )}
                  data-row={-1}
                  data-col={colIndex}
                  tabIndex={tabIndexFor(-1, colIndex)}
                  onFocus={() => setFocus({ row: -1, col: colIndex })}
                  onClick={canSort ? () => column?.toggleSorting() : undefined}
                >
                  <span className={styles.headLabel}>{c.header}</span>
                  {canSort ? (
                    <span className={cx(styles.sortIcon, dir && styles.sorted)} aria-hidden="true">
                      {dir === "desc" ? <ArrowDownIcon size={14} /> : <ArrowUpIcon size={14} />}
                    </span>
                  ) : null}
                </div>
              );
            })}
            {columnChooser ? (
              <div
                role="columnheader"
                aria-colindex={colCount}
                aria-label="Columns"
                className={cx(styles.headCell, styles.chooserCell)}
                data-row={-1}
                data-col={colCount - 1}
                tabIndex={tabIndexFor(-1, colCount - 1)}
                onFocus={() => setFocus({ row: -1, col: colCount - 1 })}
              >
                <Menu>
                  <MenuTrigger>
                    <button
                      type="button"
                      className={styles.chooser}
                      aria-label="Choose columns"
                      tabIndex={-1}
                    >
                      <ColumnsIcon size={16} />
                    </button>
                  </MenuTrigger>
                  <MenuContent align="end">
                    <MenuLabel>Columns</MenuLabel>
                    {columns.map((c) => (
                      <MenuCheckboxItem
                        key={c.id}
                        checked={!hidden.includes(c.id)}
                        disabled={c.hideable === false}
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={(checked) =>
                          setHidden(
                            checked === true ? hidden.filter((h) => h !== c.id) : [...hidden, c.id],
                          )
                        }
                      >
                        {c.header}
                      </MenuCheckboxItem>
                    ))}
                  </MenuContent>
                </Menu>
              </div>
            ) : null}
          </div>
        </div>
        {loading ? (
          <div role="rowgroup" className={styles.skeletonBody}>
            {Array.from({ length: 8 }, (_, r) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
              <div key={r} role="row" className={styles.row} aria-rowindex={r + 2}>
                {tracks.map((_, c) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
                  <div key={c} role="gridcell" className={styles.cell}>
                    {c === 0 && selectable ? null : (
                      <Skeleton width={`${40 + ((r * 7 + c * 13) % 50)}%`} />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : null}
        {showBody ? (
          <div
            role="rowgroup"
            className={styles.body}
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              if (!row) return null;
              const selected = row.getIsSelected();
              const isActive = activeRowId !== undefined && row.id === activeRowId;
              return (
                // biome-ignore lint/a11y/useKeyWithClickEvents: the grid handles Enter.
                <div
                  key={row.id}
                  role="row"
                  aria-rowindex={item.index + 2}
                  aria-selected={selectable ? selected : undefined}
                  aria-current={isActive || undefined}
                  data-selected={selected || undefined}
                  data-active={isActive || undefined}
                  className={cx(styles.row, onRowClick && styles.clickable)}
                  style={{ transform: `translateY(${item.start}px)`, height: item.size }}
                  onClick={(e: MouseEvent<HTMLDivElement>) => {
                    if ((e.target as HTMLElement).closest("button,a,input,[role=checkbox]")) return;
                    onRowClick?.(row.original);
                  }}
                >
                  {selectable ? (
                    <div
                      role="gridcell"
                      aria-colindex={1}
                      className={cx(styles.cell, styles.selectCell)}
                      data-row={item.index}
                      data-col={0}
                      tabIndex={tabIndexFor(item.index, 0)}
                      onFocus={() => setFocus({ row: item.index, col: 0 })}
                    >
                      <Checkbox
                        aria-label={`Select row ${item.index + 1}`}
                        checked={selected}
                        tabIndex={-1}
                        onClick={(e) => row.getToggleSelectedHandler()(e)}
                      />
                    </div>
                  ) : null}
                  {visibleColumns.map((c, i) => {
                    const colIndex = i + firstDataCol;
                    const col = byId.get(c.id);
                    const content = col?.cell
                      ? col.cell(row.original)
                      : (() => {
                          const v = col?.accessor?.(row.original);
                          return isEmpty(v) ? <span className={styles.none}>—</span> : String(v);
                        })();
                    return (
                      <div
                        key={c.id}
                        role="gridcell"
                        aria-colindex={colIndex + 1}
                        className={cx(
                          styles.cell,
                          c.align === "end" && styles.alignEnd,
                          c.align === "center" && styles.alignCenter,
                        )}
                        data-row={item.index}
                        data-col={colIndex}
                        tabIndex={tabIndexFor(item.index, colIndex)}
                        onFocus={() => setFocus({ row: item.index, col: colIndex })}
                      >
                        {content}
                      </div>
                    );
                  })}
                  {columnChooser ? (
                    <div
                      role="gridcell"
                      aria-colindex={colCount}
                      className={styles.cell}
                      data-row={item.index}
                      data-col={colCount - 1}
                      tabIndex={tabIndexFor(item.index, colCount - 1)}
                      onFocus={() => setFocus({ row: item.index, col: colCount - 1 })}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
        {!loading && error ? (
          <div className={styles.state}>
            <EmptyState
              size="compact"
              headingLevel={3}
              icon={ErrorIcon}
              title={error.title}
              description={error.description}
              actions={
                error.onRetry ? (
                  <Button size="sm" onClick={error.onRetry}>
                    Try again
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : null}
        {!loading && !error && rows.length === 0 ? (
          <div className={styles.state}>
            {empty ?? (
              <EmptyState
                size="compact"
                headingLevel={3}
                icon={SearchIcon}
                title="Nothing here"
                description="No rows match. Clear a filter to see more."
              />
            )}
          </div>
        ) : null}
      </div>
      <p id={liveId} className={styles.srOnly} aria-live="polite">
        {selectable && selectedIds.length > 0
          ? `${selectedIds.length} ${selectedIds.length === 1 ? "row" : "rows"} selected`
          : loading
            ? "Loading"
            : ""}
      </p>
      <MotionFeatures>
        <AnimatePresence>
          {selectable && selectedIds.length > 0 && bulkActions ? (
            <m.div
              key="bulk"
              role="region"
              aria-label="Bulk actions"
              className={styles.bulk}
              {...variants.rise}
              transition={standard}
            >
              <span className={styles.bulkCount}>{selectedIds.length} selected</span>
              <div className={styles.bulkActions}>
                {bulkActions({ ids: selectedIds, rows: selectedRows, clear: clearSelection })}
              </div>
              <Button size="sm" variant="ghost" icon={CloseIcon} onClick={clearSelection}>
                Clear
              </Button>
            </m.div>
          ) : null}
        </AnimatePresence>
      </MotionFeatures>
    </div>
  );
}
