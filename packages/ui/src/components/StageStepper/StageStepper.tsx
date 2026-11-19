import {
  AppealIcon,
  ApprovalIcon,
  CheckIcon,
  CloseIcon,
  DocumentIcon,
  EditIcon,
  FiledAckIcon,
  type Icon,
  NoticeIcon,
  OrderIcon,
} from "@dueproof/icons";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../../utils/cx";
import { Tooltip } from "../Tooltip/Tooltip";
import styles from "./StageStepper.module.css";

/** The case lifecycle (01 §4), in order. Matches CaseStage in packages/contracts. */
export type CaseStage =
  | "received"
  | "gathering"
  | "drafting"
  | "approval"
  | "filed"
  | "order"
  | "appeal"
  | "closed";

export const caseStages: { id: CaseStage; label: string; short: string; icon: Icon }[] = [
  { id: "received", label: "Received", short: "Received", icon: NoticeIcon },
  { id: "gathering", label: "Documents gathered", short: "Documents", icon: DocumentIcon },
  { id: "drafting", label: "Draft reply", short: "Draft", icon: EditIcon },
  { id: "approval", label: "Partner approval", short: "Approval", icon: ApprovalIcon },
  { id: "filed", label: "Filed on portal", short: "Filed", icon: FiledAckIcon },
  { id: "order", label: "Order received", short: "Order", icon: OrderIcon },
  { id: "appeal", label: "Appeal", short: "Appeal", icon: AppealIcon },
  { id: "closed", label: "Closed", short: "Closed", icon: CheckIcon },
];

export interface StageStepperProps extends Omit<ComponentProps<"nav">, "children"> {
  /** Where the case stands. */
  current: CaseStage;
  /** Stages passed over (e.g. no appeal). Shown struck through, with "skipped". */
  skipped?: CaseStage[];
  /** Per-stage detail under the label: "ARN AA270…", "24 Oct". */
  details?: Partial<Record<CaseStage, ReactNode>>;
  /**
   * Offer each stage as a button (a person moves the stage; the app asks for
   * a reason and audits it). Without it the bar is read-only.
   */
  onStageSelect?: (stage: CaseStage) => void;
  /** compact: labels only on the current stage, for narrow spaces. */
  size?: "md" | "compact";
  "aria-label"?: string;
}

/**
 * The case stage bar: received → documents gathered → draft reply → partner
 * approval → filed on portal → order received → appeal → closed. Each stage
 * carries an icon and a word, and its state is spoken.
 */
export function StageStepper({
  current,
  skipped = [],
  details,
  onStageSelect,
  size = "md",
  className,
  "aria-label": ariaLabel = "Case stage",
  ...rest
}: StageStepperProps) {
  const currentIndex = caseStages.findIndex((s) => s.id === current);
  return (
    <nav aria-label={ariaLabel} className={cx(styles.nav, styles[size], className)} {...rest}>
      <ol className={styles.list}>
        {caseStages.map((stage, i) => {
          const isSkipped = skipped.includes(stage.id);
          const state = isSkipped
            ? "skipped"
            : i < currentIndex
              ? "complete"
              : i === currentIndex
                ? "current"
                : "upcoming";
          const StageIcon = isSkipped ? CloseIcon : state === "complete" ? CheckIcon : stage.icon;
          const spoken = {
            complete: "done",
            current: "current stage",
            upcoming: "not reached",
            skipped: "skipped",
          }[state];
          const body = (
            <>
              <span className={styles.marker} aria-hidden="true">
                <StageIcon size={14} strokeWidth={state === "complete" ? 2.25 : 1.75} />
              </span>
              <span className={styles.text}>
                <span className={styles.label}>
                  {size === "compact" && state !== "current" ? (
                    <span className={styles.srOnly}>{stage.label}</span>
                  ) : (
                    stage.label
                  )}
                  <span className={styles.srOnly}>, {spoken}</span>
                </span>
                {details?.[stage.id] && size !== "compact" ? (
                  <span className={styles.detail}>{details[stage.id]}</span>
                ) : null}
              </span>
            </>
          );
          return (
            <li
              key={stage.id}
              className={cx(styles.stage, styles[state])}
              aria-current={state === "current" ? "step" : undefined}
            >
              {onStageSelect ? (
                state === "current" ? (
                  <button type="button" className={styles.button} disabled>
                    {body}
                  </button>
                ) : (
                  // When the step is drawn as an icon only, the tooltip names it on
                  // hover and on focus (M13); the accessible name already does.
                  <Tooltip content={stage.label}>
                    <button
                      type="button"
                      className={styles.button}
                      onClick={() => onStageSelect(stage.id)}
                    >
                      {body}
                    </button>
                  </Tooltip>
                )
              ) : (
                <span className={styles.button}>{body}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
