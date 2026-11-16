import { ArrowDownIcon, ArrowRightIcon, ArrowUpIcon, type Icon } from "@dueproof/icons";
import { type ComponentProps, type ReactNode, useId } from "react";
import { cx } from "../../utils/cx";
import styles from "./Card.module.css";

export interface CardProps extends Omit<ComponentProps<"section">, "title"> {
  title?: ReactNode;
  /** A line under the title. */
  description?: ReactNode;
  /** Buttons at the top right ("See all"). */
  actions?: ReactNode;
  footer?: ReactNode;
  /** surface: white on the canvas (default). outline: hairline only. sunken: recessed. */
  variant?: "surface" | "outline" | "sunken";
  padding?: "none" | "sm" | "md" | "lg";
  headingLevel?: 2 | 3 | 4;
}

/** A titled surface that groups related content. */
export function Card({
  title,
  description,
  actions,
  footer,
  variant = "surface",
  padding = "md",
  headingLevel = 2,
  className,
  children,
  ...rest
}: CardProps) {
  const titleId = useId();
  const Heading = `h${headingLevel}` as const;
  return (
    <section
      className={cx(styles.card, styles[variant], styles[`pad-${padding}`], className)}
      aria-labelledby={title ? titleId : undefined}
      {...rest}
    >
      {title || actions ? (
        <header className={styles.header}>
          <div className={styles.headings}>
            {title ? (
              <Heading id={titleId} className={styles.title}>
                {title}
              </Heading>
            ) : null}
            {description ? <p className={styles.description}>{description}</p> : null}
          </div>
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </header>
      ) : null}
      {children}
      {footer ? <footer className={styles.footer}>{footer}</footer> : null}
    </section>
  );
}

export interface StatDelta {
  /** Already formatted: "+₹12.4 lakh", "−3", "+8%". */
  value: string;
  direction: "up" | "down" | "flat";
  /** Whether the change is good, bad or neither (more overdue is bad; more done is good). */
  tone?: "positive" | "negative" | "neutral";
  /** "since last month". */
  period?: string;
}

export interface StatCardProps extends Omit<ComponentProps<"div">, "title"> {
  label: ReactNode;
  /** The figure, already formatted (or an <Amount>). */
  value: ReactNode;
  delta?: StatDelta;
  icon?: Icon;
  /** A small chart beside the value, e.g. <Sparkline>. */
  sparkline?: ReactNode;
  /** A line under the value. */
  footnote?: ReactNode;
  /** "attention" tints the value for overdue counts. */
  tone?: "default" | "attention" | "accent";
  /** Makes the card a link (e.g. to the exposure report). */
  href?: string;
  onSelect?: () => void;
}

const deltaIcon = { up: ArrowUpIcon, down: ArrowDownIcon, flat: ArrowRightIcon } as const;

/** One headline figure with its change and an optional sparkline. */
export function StatCard({
  label,
  value,
  delta,
  icon: StatIcon,
  sparkline,
  footnote,
  tone = "default",
  href,
  onSelect,
  className,
  ...rest
}: StatCardProps) {
  const DeltaIcon = delta ? deltaIcon[delta.direction] : null;
  const body = (
    <>
      <div className={styles.statTop}>
        {StatIcon ? <StatIcon size={16} className={styles.statIcon} /> : null}
        <span className={styles.statLabel}>{label}</span>
      </div>
      <div className={styles.statMain}>
        <span className={cx(styles.statValue, styles[`value-${tone}`])}>{value}</span>
        {sparkline ? (
          <span className={styles.sparkline} aria-hidden="true">
            {sparkline}
          </span>
        ) : null}
      </div>
      {delta && DeltaIcon ? (
        <span className={cx(styles.delta, styles[`delta-${delta.tone ?? "neutral"}`])}>
          <DeltaIcon size={12} strokeWidth={2} />
          <span>{delta.value}</span>
          {delta.period ? <span className={styles.period}>{delta.period}</span> : null}
        </span>
      ) : null}
      {footnote ? <span className={styles.statFootnote}>{footnote}</span> : null}
    </>
  );
  const cls = cx(
    styles.card,
    styles.surface,
    styles.stat,
    (href || onSelect) && styles.interactive,
    className,
  );
  if (href) {
    return (
      <a href={href} className={cls} onClick={onSelect}>
        {body}
      </a>
    );
  }
  if (onSelect) {
    return (
      <button type="button" className={cls} onClick={onSelect}>
        {body}
      </button>
    );
  }
  return (
    <div className={cls} {...rest}>
      {body}
    </div>
  );
}

export interface SparklineProps extends Omit<ComponentProps<"svg">, "values"> {
  values: number[];
  /** Accessible summary, e.g. "Open demand over 6 months, rising". Decorative without it. */
  label?: string;
  tone?: "accent" | "neutral" | "danger" | "success";
}

/** A tiny trend line. Scales to its box; colour from the tone. */
export function Sparkline({ values, label, tone = "accent", className, ...rest }: SparklineProps) {
  const w = 100;
  const h = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = values.length > 1 ? (i / (values.length - 1)) * w : w / 2;
    const y = h - 2 - ((v - min) / span) * (h - 4);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  const last = pts[pts.length - 1];
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: titled when labelled, otherwise aria-hidden.
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={cx(styles.spark, styles[`spark-${tone}`], className)}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      {...rest}
    >
      {label ? <title>{label}</title> : null}
      <path d={area} className={styles.sparkArea} />
      <path d={line} className={styles.sparkLine} vectorEffect="non-scaling-stroke" />
      {last ? <circle cx={last[0]} cy={last[1]} r="2" className={styles.sparkDot} /> : null}
    </svg>
  );
}
