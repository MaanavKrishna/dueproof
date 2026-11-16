import type { Icon } from "@dueproof/icons";
import { RadioGroup as RadixRadio } from "radix-ui";
import type { CSSProperties } from "react";
import { MotionFeatures, m, snap } from "../../motion";
import { cx } from "../../utils/cx";
import { useControllableState } from "../../utils/use-controllable";
import styles from "./SegmentedControl.module.css";

export interface Segment {
  value: string;
  label: string;
  icon?: Icon;
  /** Show only the icon (the label stays as the accessible name). */
  iconOnly?: boolean;
  disabled?: boolean;
}

export interface SegmentedControlProps {
  segments: Segment[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Accessible name for the group. */
  "aria-label": string;
  size?: "sm" | "md";
  /** Stretch to fill the container width. */
  fullWidth?: boolean;
  disabled?: boolean;
  name?: string;
  className?: string;
}

/**
 * Switch between a few views or modes (2–5). A radio group underneath:
 * ←/→ move and select, Tab leaves the group.
 */
export function SegmentedControl({
  segments,
  value: valueProp,
  defaultValue,
  onValueChange,
  size = "md",
  fullWidth = false,
  disabled = false,
  name,
  className,
  "aria-label": ariaLabel,
}: SegmentedControlProps) {
  const [value, setValue] = useControllableState(
    valueProp,
    defaultValue ?? segments[0]?.value ?? "",
    onValueChange,
  );
  const index = Math.max(
    0,
    segments.findIndex((s) => s.value === value),
  );
  return (
    <RadixRadio.Root
      value={value}
      onValueChange={setValue}
      orientation="horizontal"
      loop
      aria-label={ariaLabel}
      disabled={disabled}
      {...(name ? { name } : {})}
      className={cx(styles.root, styles[size], fullWidth && styles.fullWidth, className)}
      style={{ "--segments": segments.length } as CSSProperties}
    >
      <MotionFeatures>
        <m.span
          aria-hidden="true"
          className={styles.thumb}
          initial={false}
          animate={{ x: `${index * 100}%` }}
          transition={snap}
        />
      </MotionFeatures>
      {segments.map(({ value: v, label, icon: SegmentIcon, iconOnly, disabled: segDisabled }) => (
        <RadixRadio.Item
          key={v}
          value={v}
          disabled={segDisabled ?? false}
          aria-label={iconOnly ? label : undefined}
          className={styles.segment}
        >
          {SegmentIcon ? <SegmentIcon size={size === "sm" ? 14 : 16} /> : null}
          {iconOnly ? null : (
            <span className={styles.label} data-text={label}>
              {label}
            </span>
          )}
        </RadixRadio.Item>
      ))}
    </RadixRadio.Root>
  );
}
