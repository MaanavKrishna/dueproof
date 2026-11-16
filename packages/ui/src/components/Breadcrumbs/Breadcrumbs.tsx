import { ChevronRightIcon, MoreIcon } from "@dueproof/icons";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../../utils/cx";
import type { LinkRenderProps } from "../AppShell/AppShell";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../Menu/Menu";
import styles from "./Breadcrumbs.module.css";

export interface BreadcrumbItem {
  id: string;
  label: string;
  href?: string;
  onSelect?: () => void;
}

export interface BreadcrumbsProps extends Omit<ComponentProps<"nav">, "children"> {
  /** From the top level down to the current page (last). */
  items: BreadcrumbItem[];
  /** Above this many, the middle items fold into a menu. Default 4. */
  maxItems?: number;
  renderLink?: (props: LinkRenderProps) => ReactNode;
}

/** Where this page sits: Clients › Harbour Valley Foods › ASMT-10. */
export function Breadcrumbs({
  items,
  maxItems = 4,
  renderLink,
  className,
  "aria-label": ariaLabel = "Breadcrumb",
  ...rest
}: BreadcrumbsProps) {
  const fold = items.length > maxItems;
  const first = items[0];
  const hidden = fold ? items.slice(1, items.length - (maxItems - 2)) : [];
  const shown = fold ? items.slice(items.length - (maxItems - 2)) : items.slice(1);

  const renderItem = (item: BreadcrumbItem, current: boolean) => {
    if (current) {
      return (
        <span className={cx(styles.link, styles.current)} aria-current="page">
          {item.label}
        </span>
      );
    }
    if (item.href) {
      if (renderLink) {
        return renderLink({
          href: item.href,
          className: styles.link ?? "",
          children: item.label,
          ...(item.onSelect ? { onClick: item.onSelect } : {}),
        });
      }
      return (
        <a href={item.href} className={styles.link} onClick={item.onSelect}>
          {item.label}
        </a>
      );
    }
    return (
      <button type="button" className={styles.link} onClick={item.onSelect}>
        {item.label}
      </button>
    );
  };

  const sep = (
    <span className={styles.sep} aria-hidden="true">
      <ChevronRightIcon size={14} />
    </span>
  );

  return (
    <nav aria-label={ariaLabel} className={cx(styles.nav, className)} {...rest}>
      <ol className={styles.list}>
        {first ? <li className={styles.item}>{renderItem(first, items.length === 1)}</li> : null}
        {hidden.length > 0 ? (
          <li className={styles.item}>
            {sep}
            <Menu>
              <MenuTrigger>
                <button
                  type="button"
                  className={cx(styles.link, styles.more)}
                  aria-label={`${hidden.length} more`}
                >
                  <MoreIcon size={16} />
                </button>
              </MenuTrigger>
              <MenuContent>
                {hidden.map((item) => (
                  <MenuItem
                    key={item.id}
                    onSelect={() => {
                      if (item.onSelect) item.onSelect();
                      else if (item.href) window.location.assign(item.href);
                    }}
                  >
                    {item.label}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          </li>
        ) : null}
        {shown.map((item, i) => (
          <li key={item.id} className={styles.item}>
            {sep}
            {renderItem(item, i === shown.length - 1)}
          </li>
        ))}
      </ol>
    </nav>
  );
}
