import type { ReactNode } from "react";
import type { LinkRenderProps } from "../components/AppShell/AppShell";
import { Button } from "../components/Button/Button";
import { SettingsLayout, type SettingsNavItem } from "../components/SettingsLayout/SettingsLayout";
import { Toolbar } from "../components/Toolbar/Toolbar";
import { cx } from "../utils/cx";
import styles from "./templates.module.css";

export interface SettingsPageTemplateProps {
  /** "Settings". */
  title: ReactNode;
  subtitle?: ReactNode;
  breadcrumbs?: ReactNode;
  actions?: ReactNode;
  banner?: ReactNode;
  sections: SettingsNavItem[];
  activeSection: string;
  onSectionChange?: (id: string) => void;
  renderLink?: (props: LinkRenderProps) => ReactNode;
  /** The section's forms: SettingsSection blocks with SettingsRow controls. */
  children: ReactNode;
  /** Show the save bar. */
  dirty?: boolean;
  saving?: boolean;
  onSave?: () => void;
  onDiscard?: () => void;
  saveLabel?: string;
  className?: string;
}

/**
 * Settings: title, section navigation, forms, and a save bar that appears
 * when something has changed.
 */
export function SettingsPageTemplate({
  title,
  subtitle,
  breadcrumbs,
  actions,
  banner,
  sections,
  activeSection,
  onSectionChange,
  renderLink,
  children,
  dirty = false,
  saving = false,
  onSave,
  onDiscard,
  saveLabel = "Save changes",
  className,
}: SettingsPageTemplateProps) {
  const footer =
    dirty && onSave ? (
      <>
        <span className={styles.unsaved} role="status">
          You have unsaved changes
        </span>
        {onDiscard ? (
          <Button variant="ghost" onClick={onDiscard} disabled={saving}>
            Discard
          </Button>
        ) : null}
        <Button variant="primary" onClick={onSave} loading={saving}>
          {saveLabel}
        </Button>
      </>
    ) : undefined;
  return (
    <div className={cx(styles.page, styles.scrollPage, className)}>
      <Toolbar title={title} subtitle={subtitle} breadcrumbs={breadcrumbs} actions={actions} />
      {banner ? <div className={styles.banner}>{banner}</div> : null}
      <SettingsLayout
        sections={sections}
        activeId={activeSection}
        {...(onSectionChange ? { onSectionChange } : {})}
        {...(renderLink ? { renderLink } : {})}
        footer={footer}
      >
        {children}
      </SettingsLayout>
    </div>
  );
}
