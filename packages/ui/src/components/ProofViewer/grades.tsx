import { CheckIcon, EyeOffIcon, type Icon, VerifiedIcon, WarningIcon } from "@dueproof/icons";
import type { ComponentProps } from "react";
import { cx } from "../../utils/cx";
import styles from "./grades.module.css";

/** How well a quote was located on its page. Matches Verification in packages/contracts. */
export type ProofGrade = "exact" | "strong" | "approximate" | "unlocated";

export const proofGrades: Record<
  ProofGrade,
  { label: string; spoken: string; icon: Icon; description: string }
> = {
  exact: {
    label: "Exact",
    spoken: "exact match",
    icon: VerifiedIcon,
    description: "The quote was found word for word on the page.",
  },
  strong: {
    label: "Strong",
    spoken: "strong match",
    icon: CheckIcon,
    description: "The quote was found with small differences (spacing, OCR).",
  },
  approximate: {
    label: "Approximate",
    spoken: "approximate match",
    icon: WarningIcon,
    description: "Only part of the quote was found. Check the page before relying on it.",
  },
  unlocated: {
    label: "Not located",
    spoken: "not located on the page",
    icon: EyeOffIcon,
    description: "The quote couldn't be found on the page. A person must confirm it.",
  },
};

export interface GradeBadgeProps extends Omit<ComponentProps<"span">, "children"> {
  grade: ProofGrade;
  size?: "sm" | "md";
  /** Show the word (default) or only the icon (with an accessible label). */
  iconOnly?: boolean;
}

/** The proof grade: exact · strong · approximate · not located. Icon, word and style differ. */
export function GradeBadge({
  grade,
  size = "md",
  iconOnly = false,
  className,
  ...rest
}: GradeBadgeProps) {
  const g = proofGrades[grade];
  const GIcon = g.icon;
  return (
    <span
      className={cx(styles.badge, styles[grade], styles[size], className)}
      title={g.description}
      data-grade={grade}
      {...(iconOnly ? { role: "img", "aria-label": `Proof: ${g.spoken}` } : {})}
      {...rest}
    >
      <GIcon size={size === "sm" ? 12 : 14} strokeWidth={2} />
      {iconOnly ? null : <span>{g.label}</span>}
    </span>
  );
}
