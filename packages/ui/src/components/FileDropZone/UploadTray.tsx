import {
  ChevronDownIcon,
  CloseIcon,
  DocumentIcon,
  DoneIcon,
  ErrorIcon,
  type Icon,
  LockIcon,
  RefreshIcon,
  SpinnerIcon,
  WarningIcon,
} from "@dueproof/icons";
import { type ComponentProps, useId, useState } from "react";
import { cx } from "../../utils/cx";
import { Button } from "../Button/Button";
import { IconButton } from "../IconButton/IconButton";
import styles from "./UploadTray.module.css";

/** Pipeline stages a file passes through after upload (03 §6), plus outcomes. */
export type UploadStage =
  | "queued"
  | "uploading"
  | "reading"
  | "translating"
  | "finding"
  | "checking"
  | "done"
  | "needs_review"
  | "needs_password"
  | "duplicate"
  | "failed"
  | "quarantined";

export interface UploadItem {
  id: string;
  name: string;
  /** Bytes. */
  size: number;
  stage: UploadStage;
  /** 0–1 while uploading. */
  progress?: number;
  /** Why it failed, in plain words, and what to do. */
  error?: string;
  /** Extra line: "3 pages · Hindi", "Already in the register". */
  detail?: string;
}

export interface UploadTrayProps extends Omit<ComponentProps<"section">, "title"> {
  items: UploadItem[];
  onRetry?: (id: string) => void;
  onRemove?: (id: string) => void;
  onCancel?: (id: string) => void;
  onOpen?: (id: string) => void;
  onEnterPassword?: (id: string) => void;
  /** Clear finished rows. */
  onClearDone?: () => void;
  defaultCollapsed?: boolean;
}

const pipeline: UploadStage[] = ["uploading", "reading", "finding", "checking", "done"];

const stageInfo: Record<UploadStage, { label: string; icon: Icon; tone: string }> = {
  queued: { label: "Waiting", icon: DocumentIcon, tone: "neutral" },
  uploading: { label: "Uploading", icon: SpinnerIcon, tone: "progress" },
  reading: { label: "Reading pages", icon: SpinnerIcon, tone: "progress" },
  translating: { label: "Translating", icon: SpinnerIcon, tone: "progress" },
  finding: { label: "Finding dates and duties", icon: SpinnerIcon, tone: "progress" },
  checking: { label: "Checking proof", icon: SpinnerIcon, tone: "progress" },
  done: { label: "Ready", icon: DoneIcon, tone: "success" },
  // "Needs review" is kept for findings (M1): a document says what to do.
  needs_review: { label: "Read: something to check", icon: WarningIcon, tone: "warning" },
  needs_password: { label: "This PDF needs a password", icon: LockIcon, tone: "warning" },
  duplicate: { label: "Already in the register", icon: WarningIcon, tone: "warning" },
  failed: { label: "Failed", icon: ErrorIcon, tone: "danger" },
  quarantined: { label: "Held for safety review", icon: ErrorIcon, tone: "danger" },
};

/** Two messages that say the same thing, ignoring a full stop and case. */
function sameWords(a: string, b: string): boolean {
  const norm = (x: string) => x.trim().replace(/\.$/, "").toLowerCase();
  return norm(a) === norm(b);
}

function bytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

function fraction(item: UploadItem): number | null {
  if (item.stage === "uploading") return (item.progress ?? 0) * (1 / pipeline.length);
  const stage = item.stage === "translating" ? "reading" : item.stage;
  const i = pipeline.indexOf(stage);
  if (i < 0) return null;
  return (i + (stage === "done" ? 0 : 0.5)) / (pipeline.length - 1);
}

/**
 * Files on their way in: one row per file with its pipeline stage, progress,
 * and what to do when something goes wrong. Collapsible.
 */
export function UploadTray({
  items,
  onRetry,
  onRemove,
  onCancel,
  onOpen,
  onEnterPassword,
  onClearDone,
  defaultCollapsed = false,
  className,
  ...rest
}: UploadTrayProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const listId = useId();
  const working = items.filter(
    (i) => stageInfo[i.stage].tone === "progress" || i.stage === "queued",
  );
  const done = items.filter((i) => i.stage === "done").length;
  const problems = items.filter((i) =>
    ["danger", "warning"].includes(stageInfo[i.stage].tone),
  ).length;
  // Counts up, never down (L3): "Reading 7 files · 3 done".
  const summary = working.length
    ? `Reading ${items.length} ${items.length === 1 ? "file" : "files"} · ${items.length - working.length} done`
    : `${done} of ${items.length} ready`;

  return (
    <section className={cx(styles.tray, className)} aria-label="Uploads" {...rest}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={!collapsed}
          aria-controls={listId}
          onClick={() => setCollapsed(!collapsed)}
        >
          <ChevronDownIcon size={16} className={cx(styles.chevron, collapsed && styles.closed)} />
          <span className={styles.summary} aria-live="polite">
            {summary}
          </span>
          {problems ? (
            <span className={styles.problems}>
              {problems} {problems === 1 ? "needs" : "need"} attention
            </span>
          ) : null}
        </button>
        {onClearDone && done ? (
          <Button size="sm" variant="plain" onClick={onClearDone}>
            Clear finished
          </Button>
        ) : null}
      </header>
      <ul id={listId} className={styles.list} hidden={collapsed}>
        {items.map((item) => {
          const info = stageInfo[item.stage];
          const StageIcon = info.icon;
          const f = fraction(item);
          const pct = f === null ? null : Math.round(f * 100);
          const spinning = info.tone === "progress";
          return (
            <li key={item.id} className={cx(styles.item, styles[`tone-${info.tone}`])}>
              <span className={styles.fileIcon} aria-hidden="true">
                <DocumentIcon size={18} />
              </span>
              <div className={styles.body}>
                <div className={styles.line}>
                  <span className={styles.name} title={item.name}>
                    {item.name}
                  </span>
                  <span className={styles.size}>{bytes(item.size)}</span>
                </div>
                <div className={styles.status}>
                  <StageIcon size={14} className={cx(spinning && styles.spin)} />
                  <span>{info.label}</span>
                  {item.stage === "uploading" && item.progress !== undefined ? (
                    <span className={styles.pct}>{Math.round(item.progress * 100)}%</span>
                  ) : null}
                  {item.detail && !sameWords(item.detail, info.label) ? (
                    <span className={styles.detail}>· {item.detail}</span>
                  ) : null}
                </div>
                {/* Said once (L4): not again when it repeats the status. */}
                {item.error && !sameWords(item.error, info.label) ? (
                  <p className={styles.error}>{item.error}</p>
                ) : null}
                {pct !== null && item.stage !== "done" ? (
                  <div
                    className={styles.track}
                    role="progressbar"
                    aria-label={`${item.name}: ${info.label}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pct}
                  >
                    <span className={styles.fill} style={{ transform: `scaleX(${f})` }} />
                  </div>
                ) : null}
              </div>
              <div className={styles.actions}>
                {item.stage === "needs_password" && onEnterPassword ? (
                  <Button size="sm" onClick={() => onEnterPassword(item.id)}>
                    Enter password
                  </Button>
                ) : null}
                {(item.stage === "failed" || item.stage === "needs_password") && onRetry ? (
                  <IconButton
                    size="sm"
                    icon={RefreshIcon}
                    label={`Retry ${item.name}`}
                    onClick={() => onRetry(item.id)}
                  />
                ) : null}
                {(item.stage === "done" ||
                  item.stage === "needs_review" ||
                  item.stage === "duplicate") &&
                onOpen ? (
                  <Button
                    size="sm"
                    variant="plain"
                    aria-label={`Open ${item.name}`}
                    onClick={() => onOpen(item.id)}
                  >
                    Open
                  </Button>
                ) : null}
                {spinning && onCancel ? (
                  <IconButton
                    size="sm"
                    icon={CloseIcon}
                    label={`Cancel ${item.name}`}
                    onClick={() => onCancel(item.id)}
                  />
                ) : !spinning && onRemove ? (
                  <IconButton
                    size="sm"
                    icon={CloseIcon}
                    label={`Remove ${item.name}`}
                    onClick={() => onRemove(item.id)}
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
