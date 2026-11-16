import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DocumentIcon,
  FitPageIcon,
  FitWidthIcon,
  ListChecksIcon,
  TranslateIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "@dueproof/icons";
import {
  type CSSProperties,
  Fragment,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { emphasis, fade, LayoutMotionFeatures, m, useReducedMotion } from "../../motion";
import { cx } from "../../utils/cx";
import { isTypingTarget } from "../../utils/dom";
import { useControllableState } from "../../utils/use-controllable";
import { IconButton } from "../IconButton/IconButton";
import { GradeBadge, type ProofGrade, proofGrades } from "./grades";
import styles from "./ProofViewer.module.css";

/** [x0, y0, x1, y1] from the page's top-left, in the page's unit. Matches Rect in packages/contracts. */
export type ProofRect = readonly [number, number, number, number];

export interface ProofPage {
  /** 1-based page number. */
  number: number;
  /** The rendered page image. */
  src: string;
  /** Page size in `unit`: PDF points for PDFs (A4 = 595 × 842), pixels for photos. */
  width: number;
  height: number;
  unit?: "pt" | "px";
  /** Smaller image for the page strip (defaults to `src`). */
  thumbnailSrc?: string;
  /** The page's extracted text (original language): the text alternative to the image. */
  text?: string;
  /** English translation of the page text, when the notice isn't in English. */
  translation?: string;
}

export interface ProofHighlight {
  id: string;
  /** Page number the quote is on (for unlocated quotes, the page it was expected on). */
  page: number;
  /** Boxes on the page, one per line of the quote. Empty when unlocated. */
  rects: ProofRect[];
  /** What the quote proves, in words: "reply due 20 Nov 2026". */
  label: string;
  /** The quoted text as it appears on the page. */
  quote?: string;
  grade: ProofGrade;
}

export type ProofZoom = "fit-width" | "fit-page" | number;

export interface ProofViewerProps {
  /** The document's name: "ASMT-10 · Harbour Valley Foods". */
  title: string;
  pages: ProofPage[];
  highlights?: ProofHighlight[];
  /** The highlight in focus (e.g. driven by a finding card's source button). */
  activeHighlightId?: string | null;
  defaultActiveHighlightId?: string | null;
  onActiveHighlightChange?: (id: string | null) => void;
  /** 1-based. */
  page?: number;
  defaultPage?: number;
  onPageChange?: (page: number) => void;
  zoom?: ProofZoom;
  defaultZoom?: ProofZoom;
  onZoomChange?: (zoom: ProofZoom) => void;
  /** Languages, for the text panel: { original: "Hindi", translation: "English" }. */
  languages?: { original: string; translation?: string };
  /** Show the page text beside the image (original and translation). */
  showText?: boolean;
  defaultShowText?: boolean;
  onShowTextChange?: (show: boolean) => void;
  /** Show the list of every highlight (the text alternative). */
  showList?: boolean;
  defaultShowList?: boolean;
  onShowListChange?: (show: boolean) => void;
  /** Thumbnails of the pages down the side. Default true (hidden in narrow spaces). */
  pageStrip?: boolean;
  className?: string;
}

const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;
const PAD = 24;

function cssWidth(page: ProofPage): number {
  return (page.unit ?? "pt") === "pt" ? (page.width * 96) / 72 : page.width;
}

function bounds(rects: ProofRect[]): ProofRect | null {
  if (rects.length === 0) return null;
  let [x0, y0, x1, y1] = rects[0] as ProofRect;
  for (const r of rects) {
    x0 = Math.min(x0, r[0]);
    y0 = Math.min(y0, r[1]);
    x1 = Math.max(x1, r[2]);
    y1 = Math.max(y1, r[3]);
  }
  return [x0, y0, x1, y1];
}

function pct(n: number, of: number): string {
  return `${(n / of) * 100}%`;
}

/** "Highlighted: reply due 20 Nov 2026, exact match, page 1". */
export function highlightLabel(h: ProofHighlight): string {
  if (h.grade === "unlocated") return `Not located: ${h.label}, expected on page ${h.page}`;
  return `Highlighted: ${h.label}, ${proofGrades[h.grade].spoken}, page ${h.page}`;
}

/** Mark the highlights' quotes inside a page's text. */
function markQuotes(
  text: string,
  quotes: { id: string; quote: string; active: boolean }[],
): ReactNode {
  const hits: { start: number; end: number; active: boolean }[] = [];
  const lower = text.toLowerCase();
  for (const q of quotes) {
    const at = lower.indexOf(q.quote.toLowerCase());
    if (at >= 0) hits.push({ start: at, end: at + q.quote.length, active: q.active });
  }
  hits.sort((a, b) => a.start - b.start);
  const out: ReactNode[] = [];
  let pos = 0;
  for (const h of hits) {
    if (h.start < pos) continue;
    out.push(<Fragment key={`t${pos}`}>{text.slice(pos, h.start)}</Fragment>);
    out.push(
      <mark key={`m${h.start}`} className={cx(styles.textMark, h.active && styles.textMarkActive)}>
        {text.slice(h.start, h.end)}
      </mark>,
    );
    pos = h.end;
  }
  out.push(<Fragment key="end">{text.slice(pos)}</Fragment>);
  return out;
}

/**
 * The page is the proof. Shows a page image with highlight boxes over the
 * quoted text, a page strip, zoom (fit width, fit page, +/−, ctrl/⌘-wheel),
 * pan by dragging, and the page text with its translation side by side.
 *
 * Without sight or a pointer: every highlight is a focusable button named
 * "Highlighted: <what>, <grade>, page <n>"; the highlight list and the page
 * text are text alternatives to the image. Keys: ←/→ pages, N/J and P/K next
 * and previous highlight, + and − zoom, 0 fits the width.
 */
export function ProofViewer({
  title,
  pages,
  highlights = [],
  activeHighlightId: activeProp,
  defaultActiveHighlightId = null,
  onActiveHighlightChange,
  page: pageProp,
  defaultPage,
  onPageChange,
  zoom: zoomProp,
  defaultZoom = "fit-width",
  onZoomChange,
  languages,
  showText: showTextProp,
  defaultShowText = false,
  onShowTextChange,
  showList: showListProp,
  defaultShowList = false,
  onShowListChange,
  pageStrip = true,
  className,
}: ProofViewerProps) {
  const uid = useId();
  const reduce = useReducedMotion();
  const sorted = useMemo(
    () =>
      [...highlights].sort(
        (a, b) =>
          a.page - b.page ||
          (bounds(a.rects)?.[1] ?? Number.POSITIVE_INFINITY) -
            (bounds(b.rects)?.[1] ?? Number.POSITIVE_INFINITY),
      ),
    [highlights],
  );
  const [activeId, setActiveId] = useControllableState<string | null>(
    activeProp,
    defaultActiveHighlightId,
    onActiveHighlightChange,
  );
  const active = sorted.find((h) => h.id === activeId) ?? null;
  const [pageNumber, setPageNumber] = useControllableState(
    pageProp,
    defaultPage ?? active?.page ?? pages[0]?.number ?? 1,
    onPageChange,
  );
  const [zoom, setZoom] = useControllableState<ProofZoom>(zoomProp, defaultZoom, onZoomChange);
  const [showText, setShowText] = useControllableState(
    showTextProp,
    defaultShowText,
    onShowTextChange,
  );
  const [showList, setShowList] = useControllableState(
    showListProp,
    defaultShowList,
    onShowListChange,
  );
  const [announce, setAnnounce] = useState("");
  const [loaded, setLoaded] = useState<Record<string, "ok" | "error">>({});

  const page = pages.find((p) => p.number === pageNumber) ?? pages[0];
  const pageIndex = page ? pages.indexOf(page) : 0;

  // Viewport size, for fit-width and fit-page.
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const read = () => setViewport({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const naturalW = page ? cssWidth(page) : 1;
  const naturalH = page ? naturalW * (page.height / page.width) : 1;
  const fitW = viewport.w > 0 ? (viewport.w - PAD * 2) / naturalW : 1;
  const fitP = viewport.h > 0 ? Math.min(fitW, (viewport.h - PAD * 2) / naturalH) : fitW;
  const scale = Math.max(
    MIN_ZOOM,
    Math.min(MAX_ZOOM, zoom === "fit-width" ? fitW : zoom === "fit-page" ? fitP : zoom),
  );
  const displayW = naturalW * scale;
  const displayH = naturalH * scale;

  const zoomBy = useCallback(
    (dir: 1 | -1) => {
      const next =
        dir > 0
          ? (ZOOM_STEPS.find((s) => s > scale + 0.001) ?? MAX_ZOOM)
          : ([...ZOOM_STEPS].reverse().find((s) => s < scale - 0.001) ?? MIN_ZOOM);
      setZoom(next);
    },
    [scale, setZoom],
  );

  // ctrl/⌘ + wheel (and trackpad pinch) zooms; it needs a non-passive listener.
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const next = scaleRef.current * Math.exp(-e.deltaY * 0.002);
      setZoom(Math.round(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next)) * 100) / 100);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setZoom]);

  // Pan by dragging when the page is larger than the viewport.
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.pointerType === "touch") return;
    if ((e.target as HTMLElement).closest("button")) return;
    const el = viewportRef.current;
    if (!el || (el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight)) return;
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
    setDragging(true);
    el.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = viewportRef.current;
    if (!d || !el) return;
    el.scrollLeft = d.left - (e.clientX - d.x);
    el.scrollTop = d.top - (e.clientY - d.y);
  };
  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };

  // Jump to the active highlight: show its page, scroll it into view, and
  // (after a keyboard move) focus it.
  const focusPending = useRef(false);
  const goToHighlight = (h: ProofHighlight, focus: boolean) => {
    focusPending.current = focus;
    setActiveId(h.id);
    if (h.page !== pageNumber) setPageNumber(h.page);
    const index = sorted.indexOf(h) + 1;
    setAnnounce(`Highlight ${index} of ${sorted.length}. ${highlightLabel(h)}`);
  };

  // Scroll only when the target changes or the page re-lays out.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above.
  useEffect(() => {
    if (!active) return;
    if (active.page !== pageNumber) {
      setPageNumber(active.page);
      return;
    }
    const el = viewportRef.current;
    const b = bounds(active.rects);
    if (el && b && page) {
      const cy = ((b[1] + b[3]) / 2 / page.height) * displayH + PAD;
      const cx_ = ((b[0] + b[2]) / 2 / page.width) * displayW + PAD;
      el.scrollTo?.({
        top: Math.max(0, cy - el.clientHeight / 2),
        left: Math.max(0, cx_ - el.clientWidth / 2),
        behavior: reduce ? "auto" : "smooth",
      });
    }
    if (focusPending.current) {
      focusPending.current = false;
      document.getElementById(`${uid}-hl-${active.id}`)?.focus({ preventScroll: true });
    }
  }, [active?.id, active?.page, pageNumber, displayW]);

  const goToPage = (n: number) => {
    const target = pages[Math.max(0, Math.min(pages.length - 1, n))];
    if (!target || target.number === pageNumber) return;
    setPageNumber(target.number);
    setAnnounce(`Page ${target.number} of ${pages.length}`);
    viewportRef.current?.scrollTo?.({ top: 0, left: 0 });
  };

  const step = (dir: 1 | -1) => {
    if (sorted.length === 0) return;
    const i = active ? sorted.indexOf(active) : dir > 0 ? -1 : sorted.length;
    const next = sorted[(i + dir + sorted.length) % sorted.length];
    if (next) goToHighlight(next, true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (isTypingTarget(e.target) || e.altKey) return;
    const mod = e.ctrlKey || e.metaKey;
    switch (e.key) {
      case "ArrowRight":
        if (mod) return;
        e.preventDefault();
        goToPage(pageIndex + 1);
        return;
      case "ArrowLeft":
        if (mod) return;
        e.preventDefault();
        goToPage(pageIndex - 1);
        return;
      case "n":
      case "j":
        if (mod) return;
        e.preventDefault();
        step(1);
        return;
      case "p":
      case "k":
        if (mod) return;
        e.preventDefault();
        step(-1);
        return;
      case "+":
      case "=":
        e.preventDefault();
        zoomBy(1);
        return;
      case "-":
      case "_":
        e.preventDefault();
        zoomBy(-1);
        return;
      case "0":
        if (mod) return;
        e.preventDefault();
        setZoom("fit-width");
        return;
    }
  };

  const onPage = sorted.filter((h) => h.page === page?.number && h.rects.length > 0);
  const counts = useMemo(() => {
    const c = new Map<number, number>();
    for (const h of sorted) c.set(h.page, (c.get(h.page) ?? 0) + 1);
    return c;
  }, [sorted]);
  const status = page ? loaded[page.src] : undefined;

  const pageStyle = { width: displayW, height: displayH } as CSSProperties;

  return (
    <LayoutMotionFeatures>
      <section
        className={cx(styles.viewer, className)}
        aria-label={`Proof viewer: ${title}`}
        aria-roledescription="proof viewer"
        aria-keyshortcuts="ArrowLeft ArrowRight N P J K + - 0"
        onKeyDown={onKeyDown}
      >
        <div className={styles.toolbar} role="toolbar" aria-label="Proof viewer controls">
          <div className={styles.group}>
            <IconButton
              icon={ChevronLeftIcon}
              label="Previous page"
              shortcut="←"
              size="sm"
              disabled={pageIndex <= 0}
              onClick={() => goToPage(pageIndex - 1)}
            />
            <span className={styles.pageCount}>
              {page?.number ?? 0} / {pages.length}
            </span>
            <IconButton
              icon={ChevronRightIcon}
              label="Next page"
              shortcut="→"
              size="sm"
              disabled={pageIndex >= pages.length - 1}
              onClick={() => goToPage(pageIndex + 1)}
            />
          </div>
          <div className={styles.group}>
            <IconButton
              icon={ZoomOutIcon}
              label="Zoom out"
              shortcut="−"
              size="sm"
              disabled={scale <= MIN_ZOOM}
              onClick={() => zoomBy(-1)}
            />
            <span className={styles.zoomValue} aria-live="off">
              {Math.round(scale * 100)}%
            </span>
            <IconButton
              icon={ZoomInIcon}
              label="Zoom in"
              shortcut="+"
              size="sm"
              disabled={scale >= MAX_ZOOM}
              onClick={() => zoomBy(1)}
            />
            <IconButton
              icon={FitWidthIcon}
              label="Fit width"
              shortcut="0"
              size="sm"
              aria-pressed={zoom === "fit-width"}
              onClick={() => setZoom("fit-width")}
            />
            <IconButton
              icon={FitPageIcon}
              label="Fit page"
              size="sm"
              aria-pressed={zoom === "fit-page"}
              onClick={() => setZoom("fit-page")}
            />
          </div>
          <div className={cx(styles.group, styles.end)}>
            {active ? <GradeBadge grade={active.grade} size="sm" /> : null}
            <IconButton
              icon={ListChecksIcon}
              label={`Highlights (${sorted.length})`}
              size="sm"
              aria-pressed={showList}
              onClick={() => setShowList(!showList)}
            />
            <IconButton
              icon={TranslateIcon}
              label={
                languages?.translation
                  ? `Show text: ${languages.original} and ${languages.translation}`
                  : "Show page text"
              }
              size="sm"
              aria-pressed={showText}
              onClick={() => setShowText(!showText)}
            />
          </div>
        </div>

        <div
          className={cx(styles.body, showText && styles.withText)}
          data-strip={pageStrip && pages.length > 1 ? "" : undefined}
        >
          {pageStrip && pages.length > 1 ? (
            <nav className={styles.strip} aria-label="Pages">
              <ol className={styles.stripList}>
                {pages.map((p, i) => (
                  <li key={p.number}>
                    <button
                      type="button"
                      className={styles.thumb}
                      aria-current={p.number === page?.number ? "page" : undefined}
                      aria-label={`Page ${p.number} of ${pages.length}${counts.get(p.number) ? `, ${counts.get(p.number)} highlights` : ""}`}
                      onClick={() => goToPage(i)}
                    >
                      <span
                        className={styles.thumbImage}
                        style={{ aspectRatio: `${p.width} / ${p.height}` }}
                      >
                        <img
                          src={p.thumbnailSrc ?? p.src}
                          alt=""
                          loading="lazy"
                          draggable={false}
                        />
                      </span>
                      <span className={styles.thumbLabel}>
                        {p.number}
                        {counts.get(p.number) ? (
                          <span className={styles.thumbCount}>{counts.get(p.number)}</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}

          <div
            ref={viewportRef}
            className={cx(styles.viewport, dragging && styles.dragging)}
            data-zoom={typeof zoom === "number" ? "custom" : zoom}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {page ? (
              <div className={styles.pageWrap} style={{ padding: PAD }}>
                <div className={styles.page} style={pageStyle} data-unit={page.unit ?? "pt"}>
                  {status !== "error" ? (
                    <img
                      key={page.src}
                      src={page.src}
                      alt={`Page ${page.number} of ${title}${page.text ? ". The page text is in the text panel." : ""}`}
                      className={styles.image}
                      draggable={false}
                      data-loaded={status === "ok" || undefined}
                      onLoad={() => setLoaded((s) => ({ ...s, [page.src]: "ok" }))}
                      onError={() => setLoaded((s) => ({ ...s, [page.src]: "error" }))}
                    />
                  ) : (
                    <div className={styles.imageError} role="alert">
                      <DocumentIcon size={24} />
                      <p>This page image didn't load.</p>
                      {page.text ? (
                        <button
                          type="button"
                          className={styles.linkButton}
                          onClick={() => setShowText(true)}
                        >
                          Read the page text instead
                        </button>
                      ) : null}
                    </div>
                  )}
                  {status === undefined ? (
                    <span className={styles.loading} aria-hidden="true" />
                  ) : null}
                  {onPage.map((h) => {
                    const b = bounds(h.rects) as ProofRect;
                    const isActive = h.id === activeId;
                    const box = {
                      left: pct(b[0], page.width),
                      top: pct(b[1], page.height),
                      width: pct(b[2] - b[0], page.width),
                      height: pct(b[3] - b[1], page.height),
                    };
                    return (
                      <button
                        key={h.id}
                        id={`${uid}-hl-${h.id}`}
                        type="button"
                        className={cx(styles.highlight, styles[h.grade], isActive && styles.active)}
                        style={box}
                        aria-label={highlightLabel(h)}
                        aria-current={isActive || undefined}
                        data-grade={h.grade}
                        onClick={() => goToHighlight(h, false)}
                      >
                        {h.rects.map((r) => (
                          <span
                            key={r.join(",")}
                            className={styles.rect}
                            style={{
                              left: pct(r[0] - b[0], b[2] - b[0]),
                              top: pct(r[1] - b[1], b[3] - b[1]),
                              width: pct(r[2] - r[0], b[2] - b[0]),
                              height: pct(r[3] - r[1], b[3] - b[1]),
                            }}
                          />
                        ))}
                        {isActive ? (
                          <m.span
                            key={`pulse-${h.id}`}
                            layoutId={`${uid}-pulse`}
                            className={styles.pulse}
                            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.6 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={reduce ? fade : emphasis}
                            aria-hidden="true"
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          {showText && page ? (
            <section className={styles.textPanel} aria-label="Page text">
              {page.text ? (
                <div className={cx(styles.columns, page.translation && styles.two)}>
                  <div className={styles.column}>
                    <h3 className={styles.columnTitle}>
                      Original{languages?.original ? ` · ${languages.original}` : ""}
                    </h3>
                    <p className={styles.pageText} dir="auto">
                      {markQuotes(
                        page.text,
                        onPage
                          .filter((h) => h.quote)
                          .map((h) => ({
                            id: h.id,
                            quote: h.quote ?? "",
                            active: h.id === activeId,
                          })),
                      )}
                    </p>
                  </div>
                  {page.translation ? (
                    <div className={styles.column}>
                      <h3 className={styles.columnTitle}>
                        Translation · {languages?.translation ?? "English"}
                      </h3>
                      <p className={styles.pageText} lang="en">
                        {page.translation}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className={styles.noText}>No text was extracted from this page.</p>
              )}
            </section>
          ) : null}
        </div>

        {showList ? (
          <section className={styles.list} aria-label="Highlights">
            <h3 className={styles.listTitle}>
              {sorted.length} {sorted.length === 1 ? "highlight" : "highlights"} in this document
            </h3>
            <ol className={styles.listItems}>
              {sorted.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    className={cx(styles.listItem, h.id === activeId && styles.listActive)}
                    aria-current={h.id === activeId || undefined}
                    onClick={() => goToHighlight(h, false)}
                  >
                    <GradeBadge grade={h.grade} size="sm" />
                    <span className={styles.listText}>
                      <span className={styles.listLabel}>{h.label}</span>
                      {h.quote ? <span className={styles.listQuote}>“{h.quote}”</span> : null}
                    </span>
                    <span className={styles.listPage}>p. {h.page}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <p className={styles.srOnly} aria-live="polite">
          {announce}
        </p>
      </section>
    </LayoutMotionFeatures>
  );
}
