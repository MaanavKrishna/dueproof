import type { Icon } from "@dueproof/icons";
import { type ComponentProps, type ReactNode, useId } from "react";
import { cx } from "../../utils/cx";
import type { LinkRenderProps } from "../AppShell/AppShell";
import styles from "./SettingsLayout.module.css";

export interface SettingsNavItem {
  id: string;
  label: string;
  icon?: Icon;
  href?: string;
  /** "Hosted only", "Admin". */
  badge?: string;
}

export interface SettingsLayoutProps extends Omit<ComponentProps<"div">, "children"> {
  sections: SettingsNavItem[];
  activeId: string;
  onSectionChange?: (id: string) => void;
  renderLink?: (props: LinkRenderProps) => ReactNode;
  /** The section's forms (SettingsSection blocks). */
  children: ReactNode;
  /** Sticky actions at the bottom (Save / Discard) when there are unsaved changes. */
  footer?: ReactNode;
  navLabel?: string;
}

/**
 * Settings: section navigation on the left (a scrolling strip on phones) and
 * forms on the right, with an optional sticky save bar.
 */
export function SettingsLayout({
  sections,
  activeId,
  onSectionChange,
  renderLink,
  children,
  footer,
  navLabel = "Settings sections",
  className,
  ...rest
}: SettingsLayoutProps) {
  return (
    <div className={cx(styles.layout, className)} {...rest}>
      <nav className={styles.nav} aria-label={navLabel}>
        <ul className={styles.navList}>
          {sections.map((s) => {
            const SIcon = s.icon;
            const current = s.id === activeId ? ("page" as const) : undefined;
            const body = (
              <>
                {SIcon ? <SIcon size={18} className={styles.navIcon} /> : null}
                <span className={styles.navLabel}>{s.label}</span>
                {s.badge ? <span className={styles.navBadge}>{s.badge}</span> : null}
              </>
            );
            const cls = cx(styles.navItem, current && styles.navActive);
            return (
              <li key={s.id}>
                {s.href && renderLink ? (
                  renderLink({
                    href: s.href,
                    className: cls,
                    children: body,
                    "aria-current": current,
                    ...(onSectionChange ? { onClick: () => onSectionChange(s.id) } : {}),
                  })
                ) : s.href ? (
                  <a
                    href={s.href}
                    className={cls}
                    aria-current={current}
                    onClick={() => onSectionChange?.(s.id)}
                  >
                    {body}
                  </a>
                ) : (
                  <button
                    type="button"
                    className={cls}
                    aria-current={current}
                    onClick={() => onSectionChange?.(s.id)}
                  >
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      <div className={styles.content}>
        <div className={styles.forms}>{children}</div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>
  );
}

export interface SettingsSectionProps extends Omit<ComponentProps<"section">, "title"> {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons beside the title ("Invite people"). */
  actions?: ReactNode;
  children: ReactNode;
}

/** A titled group of settings. */
export function SettingsSection({
  title,
  description,
  actions,
  children,
  className,
  ...rest
}: SettingsSectionProps) {
  const id = useId();
  return (
    <section className={cx(styles.section, className)} aria-labelledby={id} {...rest}>
      <header className={styles.sectionHeader}>
        <div className={styles.sectionText}>
          <h2 id={id} className={styles.sectionTitle}>
            {title}
          </h2>
          {description ? <p className={styles.sectionDescription}>{description}</p> : null}
        </div>
        {actions ? <div className={styles.sectionActions}>{actions}</div> : null}
      </header>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

export interface SettingsRowProps extends Omit<ComponentProps<"div">, "title"> {
  /** The setting's name. Label the control with the same words. */
  label: ReactNode;
  description?: ReactNode;
  /** The control: a Switch, Select, TextField or Button. */
  children: ReactNode;
  /** Put the control under the label (wide controls). */
  stacked?: boolean;
}

/** One setting: label and description on the left, its control on the right. */
export function SettingsRow({
  label,
  description,
  children,
  stacked = false,
  className,
  ...rest
}: SettingsRowProps) {
  return (
    <div className={cx(styles.row, stacked && styles.stacked, className)} {...rest}>
      <div className={styles.rowText}>
        <div className={styles.rowLabel}>{label}</div>
        {description ? <div className={styles.rowDescription}>{description}</div> : null}
      </div>
      <div className={styles.rowControl}>{children}</div>
    </div>
  );
}
