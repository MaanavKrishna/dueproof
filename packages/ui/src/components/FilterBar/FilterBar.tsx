import {
  AddIcon,
  BookmarkIcon,
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  type Icon,
} from "@dueproof/icons";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../../utils/cx";
import { Button } from "../Button/Button";
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from "../Menu/Menu";
import styles from "./FilterBar.module.css";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDefinition {
  id: string;
  /** "Client", "Type", "Owner", "Stage", "Due". */
  label: string;
  icon?: Icon;
  options: FilterOption[];
  /** Allow several values (default true). Single-value filters replace their value. */
  multiple?: boolean;
}

export interface SavedView {
  id: string;
  name: string;
  /** Shared with the organisation, not just personal. */
  shared?: boolean;
}

/** Active filters: filter id → selected values. */
export type FilterValue = Record<string, string[]>;

export interface FilterBarProps extends Omit<ComponentProps<"div">, "onChange" | "defaultValue"> {
  filters: FilterDefinition[];
  value: FilterValue;
  onChange: (value: FilterValue) => void;
  /** A search field or other control at the start. */
  search?: ReactNode;
  views?: SavedView[];
  activeViewId?: string | undefined;
  onViewSelect?: (id: string) => void;
  /** Offer "Save as view…" (opens the app's naming dialog). */
  onSaveView?: () => void;
  /** Trailing controls (column chooser, density, export). */
  trailing?: ReactNode;
}

function summary(def: FilterDefinition, values: string[]): string {
  const labels = values.map((v) => def.options.find((o) => o.value === v)?.label ?? v);
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels[0]} +${labels.length - 1}`;
}

/**
 * Chips for the active filters, "Add filter", and saved views (personal and
 * shared). Each chip opens its options; × removes it.
 */
export function FilterBar({
  filters,
  value,
  onChange,
  search,
  views,
  activeViewId,
  onViewSelect,
  onSaveView,
  trailing,
  className,
  ...rest
}: FilterBarProps) {
  const active = filters.filter((f) => (value[f.id]?.length ?? 0) > 0);
  const inactive = filters.filter((f) => (value[f.id]?.length ?? 0) === 0);
  const activeView = views?.find((v) => v.id === activeViewId);

  const toggle = (def: FilterDefinition, optionValue: string, checked: boolean) => {
    const current = value[def.id] ?? [];
    const multiple = def.multiple ?? true;
    const next = checked
      ? multiple
        ? [...current, optionValue]
        : [optionValue]
      : current.filter((v) => v !== optionValue);
    const out = { ...value };
    if (next.length) out[def.id] = next;
    else delete out[def.id];
    onChange(out);
  };

  const remove = (id: string) => {
    const out = { ...value };
    delete out[id];
    onChange(out);
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: a toolbar-like group of filter controls, not a form fieldset.
    <div role="group" aria-label="Filters" className={cx(styles.bar, className)} {...rest}>
      {views && views.length > 0 ? (
        <Menu>
          <MenuTrigger>
            <Button size="sm" variant="ghost" icon={BookmarkIcon} iconEnd={ChevronDownIcon}>
              {activeView ? activeView.name : "Views"}
            </Button>
          </MenuTrigger>
          <MenuContent>
            {[false, true].map((shared) => {
              const list = views.filter((v) => Boolean(v.shared) === shared);
              if (list.length === 0) return null;
              return (
                <div key={String(shared)}>
                  <MenuLabel>{shared ? "Shared views" : "My views"}</MenuLabel>
                  {list.map((v) => (
                    <MenuItem
                      key={v.id}
                      icon={v.id === activeViewId ? CheckIcon : undefined}
                      onSelect={() => onViewSelect?.(v.id)}
                    >
                      {v.name}
                    </MenuItem>
                  ))}
                </div>
              );
            })}
            {onSaveView ? (
              <>
                <MenuSeparator />
                <MenuItem icon={AddIcon} onSelect={onSaveView}>
                  Save as view…
                </MenuItem>
              </>
            ) : null}
          </MenuContent>
        </Menu>
      ) : null}
      {search ? <div className={styles.search}>{search}</div> : null}
      {active.length > 0 ? (
        <ul className={styles.chips} aria-label="Active filters">
          {active.map((def) => {
            const values = value[def.id] ?? [];
            const DefIcon = def.icon;
            return (
              <li key={def.id} className={styles.chip}>
                <Menu>
                  <MenuTrigger>
                    <button
                      type="button"
                      className={styles.chipButton}
                      aria-label={`${def.label}: ${values
                        .map((v) => def.options.find((o) => o.value === v)?.label ?? v)
                        .join(", ")}. Change`}
                    >
                      {DefIcon ? <DefIcon size={14} /> : null}
                      <span className={styles.chipLabel}>{def.label}</span>
                      <span className={styles.chipValue}>{summary(def, values)}</span>
                    </button>
                  </MenuTrigger>
                  <MenuContent>
                    <OptionItems def={def} values={values} onToggle={toggle} />
                  </MenuContent>
                </Menu>
                <button
                  type="button"
                  className={styles.chipRemove}
                  aria-label={`Remove ${def.label} filter`}
                  onClick={() => remove(def.id)}
                >
                  <CloseIcon size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {inactive.length > 0 ? (
        <Menu>
          <MenuTrigger>
            <Button size="sm" variant="ghost" icon={AddIcon}>
              {active.length ? "Filter" : "Add filter"}
            </Button>
          </MenuTrigger>
          <MenuContent>
            {inactive.map((def) => (
              <MenuSub key={def.id}>
                <MenuSubTrigger {...(def.icon ? { icon: def.icon } : {})}>
                  {def.label}
                </MenuSubTrigger>
                <MenuSubContent>
                  <OptionItems def={def} values={[]} onToggle={toggle} />
                </MenuSubContent>
              </MenuSub>
            ))}
          </MenuContent>
        </Menu>
      ) : null}
      {active.length > 0 ? (
        <Button size="sm" variant="plain" onClick={() => onChange({})}>
          Clear all
        </Button>
      ) : null}
      {trailing ? <div className={styles.trailing}>{trailing}</div> : null}
    </div>
  );
}

function OptionItems({
  def,
  values,
  onToggle,
}: {
  def: FilterDefinition;
  values: string[];
  onToggle: (def: FilterDefinition, value: string, checked: boolean) => void;
}) {
  return (
    <>
      {def.options.map((o) => (
        <MenuCheckboxItem
          key={o.value}
          checked={values.includes(o.value)}
          onCheckedChange={(c) => onToggle(def, o.value, c === true)}
          onSelect={(e) => {
            if (def.multiple ?? true) e.preventDefault();
          }}
        >
          {o.label}
        </MenuCheckboxItem>
      ))}
    </>
  );
}
