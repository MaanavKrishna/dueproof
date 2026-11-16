import { Avatar as RadixAvatar } from "radix-ui";
import { Children, type ComponentProps, cloneElement, type ReactElement } from "react";
import { cx } from "../../utils/cx";
import styles from "./Avatar.module.css";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

export interface AvatarProps extends Omit<ComponentProps<"span">, "children"> {
  /** Person or organisation name: the accessible name and the source of the initials. */
  name: string;
  src?: string | undefined;
  size?: AvatarSize;
  /** Organisations get rounded squares, people circles. */
  shape?: "circle" | "square";
}

const tones = ["accent", "info", "success", "warning", "week"] as const;

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

function toneFor(name: string): (typeof tones)[number] {
  let h = 0;
  for (const ch of name) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return tones[h % tones.length] ?? "accent";
}

/** A person's photo, or their initials on a stable tint. */
export function Avatar({
  name,
  src,
  size = "md",
  shape = "circle",
  className,
  ...rest
}: AvatarProps) {
  return (
    <RadixAvatar.Root
      role="img"
      aria-label={name}
      className={cx(styles.avatar, styles[size], styles[shape], styles[toneFor(name)], className)}
      {...rest}
    >
      {src ? <RadixAvatar.Image src={src} alt="" className={styles.image} /> : null}
      <RadixAvatar.Fallback className={styles.fallback} delayMs={src ? 300 : 0} aria-hidden="true">
        {initials(name)}
      </RadixAvatar.Fallback>
    </RadixAvatar.Root>
  );
}

export interface AvatarStackProps extends ComponentProps<"div"> {
  children: ReactElement<AvatarProps> | ReactElement<AvatarProps>[];
  /** Show at most this many; the rest become "+N". */
  max?: number;
  size?: AvatarSize;
}

/** Overlapping avatars for the people on a notice or case. */
export function AvatarStack({
  children,
  max = 4,
  size = "sm",
  className,
  ...rest
}: AvatarStackProps) {
  const items = Children.toArray(children) as ReactElement<AvatarProps>[];
  const shown = items.slice(0, max).map((c) => cloneElement(c, { size }));
  const hidden = items.slice(max);
  const names = items.map((c) => c.props.name).join(", ");
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset is for form controls; this is a named group of images.
    <div
      role="group"
      aria-label={names}
      className={cx(styles.stack, styles[size], className)}
      {...rest}
    >
      {shown}
      {hidden.length > 0 ? (
        <span
          className={cx(styles.avatar, styles[size], styles.circle, styles.more)}
          title={hidden.map((c) => c.props.name).join(", ")}
          aria-hidden="true"
        >
          +{hidden.length}
        </span>
      ) : null}
    </div>
  );
}
