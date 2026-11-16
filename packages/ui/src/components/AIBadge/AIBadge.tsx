import {
  AiSuggestedIcon,
  CalendarStatutoryIcon,
  type Icon,
  UserIcon,
  VerifiedIcon,
} from "@dueproof/icons";
import type { ComponentProps } from "react";
import { cx } from "../../utils/cx";
import styles from "./AIBadge.module.css";

export interface AIBadgeProps extends Omit<ComponentProps<"span">, "children"> {
  /** verified: a person or the proof gate confirmed it on the page. */
  state: "suggested" | "verified";
  /** The page it was verified on: "Verified on page 2". */
  page?: number;
  size?: "sm" | "md";
  /** Short form ("AI suggestion" / "Verified · p. 2") for dense rows; the full words are the accessible name. */
  compact?: boolean;
}

/**
 * Says whether an AI output has been checked: "Suggested by AI — not yet
 * verified" (never styled like a fact) or "Verified on page 2".
 */
export function AIBadge({
  state,
  page,
  size = "md",
  compact = false,
  className,
  ...rest
}: AIBadgeProps) {
  const full =
    state === "suggested"
      ? "Suggested by AI — not yet verified"
      : page !== undefined
        ? `Verified on page ${page}`
        : "Verified";
  const short =
    state === "suggested"
      ? "AI suggestion"
      : page !== undefined
        ? `Verified · p. ${page}`
        : "Verified";
  const BIcon = state === "suggested" ? AiSuggestedIcon : VerifiedIcon;
  return (
    <span
      className={cx(styles.badge, styles[state], styles[size], className)}
      title={compact ? full : undefined}
      {...rest}
    >
      <BIcon size={size === "sm" ? 12 : 14} strokeWidth={1.75} />
      {compact ? (
        <>
          <span aria-hidden="true">{short}</span>
          <span className={styles.srOnly}>{full}</span>
        </>
      ) : (
        <span>{full}</span>
      )}
    </span>
  );
}

/** Who proposed a finding. Matches Origin in packages/contracts. */
export type FindingOrigin = "rule" | "ai" | "rule+ai" | "human";

const originInfo: Record<FindingOrigin, { label: string; spoken: string; icon: Icon }> = {
  rule: { label: "Rule", spoken: "Found by a rule", icon: CalendarStatutoryIcon },
  ai: { label: "AI", spoken: "Found by AI", icon: AiSuggestedIcon },
  "rule+ai": {
    label: "Rule + AI",
    spoken: "Found by a rule and confirmed by AI",
    icon: CalendarStatutoryIcon,
  },
  human: { label: "Added by hand", spoken: "Added by a person", icon: UserIcon },
};

export interface OriginBadgeProps extends Omit<ComponentProps<"span">, "children"> {
  origin: FindingOrigin;
  size?: "sm" | "md";
}

/** Where a finding came from: a rule, AI, both, or a person. */
export function OriginBadge({ origin, size = "md", className, ...rest }: OriginBadgeProps) {
  const info = originInfo[origin];
  const OIcon = info.icon;
  return (
    <span
      className={cx(
        styles.badge,
        styles.origin,
        styles[`origin-${origin.replace("+", "-")}`],
        styles[size],
        className,
      )}
      title={info.spoken}
      {...rest}
    >
      <OIcon size={size === "sm" ? 12 : 14} strokeWidth={1.75} />
      <span aria-hidden="true">{info.label}</span>
      <span className={styles.srOnly}>{info.spoken}</span>
    </span>
  );
}
