import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from "react";
import { cx } from "../../utils/cx";
import styles from "./Grid.module.css";

/** The kind of item, which sets the narrowest column (the layout.column tokens). */
export type GridItemSize = "stat" | "card" | "panel";

export interface GridProps extends HTMLAttributes<HTMLElement> {
  /** stat: number tiles. card: small forms and links. panel: lists of work (default). */
  min?: GridItemSize;
  /** The most items in a row, however wide the screen. Default 4. */
  maxColumns?: 1 | 2 | 3 | 4 | 5 | 6;
  /** stretch (default): items in a row share its height. start: each keeps its own. */
  align?: "stretch" | "start";
  /** The element: div (default), or ul/ol when the items are list items. */
  as?: "div" | "ul" | "ol" | "section";
  children: ReactNode;
}

/**
 * A responsive grid whose rows always fill the width. Each row holds as many
 * items as fit at the size's narrowest column, up to `maxColumns`, and the
 * last row's items share that row, so a lone last item is never stranded
 * beside an empty gap. Two grids with the same size and maximum in the same
 * column line up exactly (Today's numbers and panels).
 */
export function Grid({
  min = "panel",
  maxColumns = 4,
  align = "stretch",
  as = "div",
  className,
  style,
  children,
  ...rest
}: GridProps) {
  const Element = as as ElementType;
  return (
    <Element
      className={cx(styles.grid, styles[min], align === "start" && styles.start, className)}
      style={{ "--dp-grid-max": maxColumns, ...style } as CSSProperties}
      data-min={min}
      {...rest}
    >
      {children}
    </Element>
  );
}
