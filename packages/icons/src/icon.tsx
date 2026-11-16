import type { LucideIcon } from "lucide-react";
import type { ReactNode, Ref, SVGProps } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "ref"> {
  /** Rendered size in px (or any CSS length). Default 20: Lucide's 24 grid at UI size. */
  size?: number | string;
  /** Stroke width in grid units. Default 1.5. */
  strokeWidth?: number | string;
  /**
   * Accessible name. Without it the icon is decorative (`aria-hidden`), which is
   * right whenever a visible word sits next to it.
   */
  label?: string;
  ref?: Ref<SVGSVGElement>;
}

export type Icon = ((props: IconProps) => ReactNode) & { displayName?: string };

export const DEFAULT_SIZE = 20;
export const DEFAULT_STROKE = 1.5;

function a11y(label: string | undefined) {
  return label
    ? ({ role: "img", "aria-label": label } as const)
    : ({ "aria-hidden": true } as const);
}

/** Wrap a Lucide icon with our defaults (20px, 1.5 stroke, decorative unless labelled). */
export function fromLucide(Lucide: LucideIcon, name: string): Icon {
  const Component: Icon = ({
    size = DEFAULT_SIZE,
    strokeWidth = DEFAULT_STROKE,
    label,
    ref,
    ...rest
  }: IconProps) => (
    <Lucide
      ref={ref}
      size={size}
      strokeWidth={strokeWidth}
      focusable="false"
      data-icon={name}
      {...a11y(label)}
      {...rest}
    />
  );
  Component.displayName = name;
  return Component;
}

/** Build a custom icon from paths drawn on Lucide's 24 × 24 grid. */
export function createIcon(name: string, children: ReactNode): Icon {
  // biome-ignore lint/correctness/noComponentHookFactories: icons are created once, at module level.
  const Component: Icon = ({
    size = DEFAULT_SIZE,
    strokeWidth = DEFAULT_STROKE,
    label,
    ref,
    ...rest
  }: IconProps) => (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative unless labelled; a labelled icon renders a <title>.
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      data-icon={name}
      {...a11y(label)}
      {...rest}
    >
      {label ? <title>{label}</title> : null}
      {children}
    </svg>
  );
  Component.displayName = name;
  return Component;
}
