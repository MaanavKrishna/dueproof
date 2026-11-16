import { AlertIcon, CloseIcon, DoneIcon, type Icon, InfoIcon, WarningIcon } from "@dueproof/icons";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../../utils/cx";
import styles from "./Banner.module.css";

export type BannerTone = "info" | "success" | "warning" | "danger" | "neutral";

export interface BannerProps extends Omit<ComponentProps<"div">, "title"> {
  tone?: BannerTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Buttons or links, e.g. "Retry". */
  actions?: ReactNode;
  /** Shows a dismiss button. */
  onDismiss?: () => void;
  /** Replace the tone's icon. */
  icon?: Icon;
  /** Full-bleed strip at the top of a page (offline, read-only) instead of an inset card. */
  variant?: "inset" | "strip";
}

const toneIcon: Record<BannerTone, Icon> = {
  info: InfoIcon,
  success: DoneIcon,
  warning: WarningIcon,
  danger: AlertIcon,
  neutral: InfoIcon,
};

/**
 * A persistent message about the page or a section: offline, read-only,
 * processing failed. Danger and warning banners are announced (role="alert").
 */
export function Banner({
  tone = "info",
  title,
  children,
  actions,
  onDismiss,
  icon,
  variant = "inset",
  className,
  ...rest
}: BannerProps) {
  const BannerIcon = icon ?? toneIcon[tone];
  const urgent = tone === "danger" || tone === "warning";
  return (
    <div
      role={urgent ? "alert" : "status"}
      className={cx(styles.banner, styles[tone], styles[variant], className)}
      {...rest}
    >
      <BannerIcon size={18} className={styles.icon} />
      <div className={styles.text}>
        {title ? <p className={styles.title}>{title}</p> : null}
        {children ? <div className={styles.body}>{children}</div> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
      {onDismiss ? (
        <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss">
          <CloseIcon size={16} />
        </button>
      ) : null}
    </div>
  );
}
