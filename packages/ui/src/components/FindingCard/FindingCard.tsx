import { CheckIcon, CloseIcon, EditIcon, ProofIcon, WarningIcon } from "@dueproof/icons";
import { type ComponentProps, type ReactNode, useId } from "react";
import { cx } from "../../utils/cx";
import { AIBadge, type FindingOrigin, OriginBadge } from "../AIBadge/AIBadge";
import { Avatar } from "../Avatar/Avatar";
import type { Tone } from "../Badge/Badge";
import { Button } from "../Button/Button";
import { DueChip, type DueState } from "../DueChip/DueChip";
import { GradeBadge, type ProofGrade } from "../ProofViewer/grades";
import { StatusPill } from "../StatusPill/StatusPill";
import styles from "./FindingCard.module.css";

export interface FindingCardProps extends Omit<ComponentProps<"article">, "title"> {
  /** What must happen: "Reply to the notice with reconciliation of ITC". */
  duty: ReactNode;
  /** The due date: rung of the ladder and the formatted date. Omit for undated findings. */
  due?: { state: DueState; date: string };
  /** How the date was computed: "30 days from receipt on 24 Oct 2026". */
  basis?: ReactNode;
  /**
   * The condonation window, shown as a separate date, never merged with the
   * normal last date: { date: "24 Feb 2027", basis: "plus one month, if the delay is condoned" }.
   */
  condonation?: { date: string; basis?: ReactNode };
  owner?: { name: string; avatarUrl?: string };
  status?: { label: string; tone?: Tone };
  origin: FindingOrigin;
  /** Verified on the page (with its number) or still a suggestion. */
  verification: { state: "verified" | "suggested"; page?: number };
  /** How well the quote was located. */
  grade: ProofGrade;
  /** The quote from the page, shown under the duty. */
  quote?: string;
  /** Opens the page with this finding's highlight (drives the ProofViewer). */
  onShowSource?: () => void;
  /** "Page 1". */
  sourceLabel?: string;
  /** Below the confidence bar, or unlocated: someone must confirm, edit or dismiss it. */
  needsReview?: boolean;
  /** Why it needs review: "The date wasn't found on the page". */
  reviewReason?: ReactNode;
  onConfirm?: () => void;
  onEdit?: () => void;
  onDismiss?: () => void;
  /** This finding's highlight is the one shown in the proof viewer. */
  selected?: boolean;
  /** Extra actions (a menu). */
  actions?: ReactNode;
}

/**
 * One thing a notice requires: the duty, its due date with the basis, the
 * condonation window kept separate, owner and status, where it came from and
 * whether it's verified on the page. Unverified findings ask for review.
 */
export function FindingCard({
  duty,
  due,
  basis,
  condonation,
  owner,
  status,
  origin,
  verification,
  grade,
  quote,
  onShowSource,
  sourceLabel,
  needsReview = false,
  reviewReason,
  onConfirm,
  onEdit,
  onDismiss,
  selected = false,
  actions,
  className,
  ...rest
}: FindingCardProps) {
  const dutyId = useId();
  return (
    <article
      className={cx(
        styles.card,
        needsReview && styles.review,
        selected && styles.selected,
        className,
      )}
      aria-labelledby={dutyId}
      data-grade={grade}
      {...rest}
    >
      {needsReview ? (
        <div className={styles.reviewBar}>
          <WarningIcon size={14} />
          <span>
            <strong>Needs review.</strong>{" "}
            {reviewReason ?? "Confirm it against the page before it becomes a deadline."}
          </span>
        </div>
      ) : null}
      <div className={styles.main}>
        <div className={styles.head}>
          <h3 id={dutyId} className={styles.duty}>
            {duty}
          </h3>
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </div>
        {quote ? (
          <blockquote className={styles.quote} dir="auto">
            {quote}
          </blockquote>
        ) : null}
        {due ? (
          <div className={styles.dates}>
            <div className={styles.dateBlock}>
              <span className={styles.dateLabel}>Due</span>
              <DueChip state={due.state} detail={due.date} />
              {basis ? <span className={styles.basis}>{basis}</span> : null}
            </div>
            {condonation ? (
              <div className={cx(styles.dateBlock, styles.condonation)}>
                <span className={styles.dateLabel}>Condonation window</span>
                <span className={styles.condonationDate}>Up to {condonation.date}</span>
                {condonation.basis ? (
                  <span className={styles.basis}>{condonation.basis}</span>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : basis ? (
          <p className={styles.basis}>{basis}</p>
        ) : null}
        <div className={styles.meta}>
          {owner ? (
            <span className={styles.owner}>
              <Avatar name={owner.name} src={owner.avatarUrl} size="xs" />
              <span>{owner.name}</span>
            </span>
          ) : (
            <span className={styles.unassigned}>Unassigned</span>
          )}
          {status ? <StatusPill label={status.label} tone={status.tone ?? "neutral"} /> : null}
          <OriginBadge origin={origin} size="sm" />
          <AIBadge
            state={verification.state}
            {...(verification.page !== undefined ? { page: verification.page } : {})}
            size="sm"
            compact
          />
          {onShowSource ? (
            <button
              type="button"
              className={cx(styles.source, selected && styles.sourceActive)}
              onClick={onShowSource}
              aria-pressed={selected}
              aria-label={`Show on the page${sourceLabel ? `, ${sourceLabel}` : ""}, ${grade === "unlocated" ? "not located" : `${grade} match`}`}
            >
              <ProofIcon size={14} />
              <span>{sourceLabel ?? "Source"}</span>
              <GradeBadge grade={grade} size="sm" iconOnly />
            </button>
          ) : (
            <GradeBadge grade={grade} size="sm" />
          )}
        </div>
      </div>
      {needsReview && (onConfirm || onEdit || onDismiss) ? (
        <div className={styles.reviewActions}>
          {onConfirm ? (
            <Button size="sm" variant="primary" icon={CheckIcon} onClick={onConfirm}>
              Confirm
            </Button>
          ) : null}
          {onEdit ? (
            <Button size="sm" icon={EditIcon} onClick={onEdit}>
              Edit
            </Button>
          ) : null}
          {onDismiss ? (
            <Button size="sm" variant="ghost" icon={CloseIcon} onClick={onDismiss}>
              Dismiss
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
