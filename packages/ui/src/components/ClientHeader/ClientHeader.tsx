import { CheckIcon, CopyIcon, WarningIcon } from "@dueproof/icons";
import { type ComponentProps, type ReactNode, useEffect, useRef, useState } from "react";
import { cx } from "../../utils/cx";
import { Avatar } from "../Avatar/Avatar";
import { Tooltip } from "../Tooltip/Tooltip";
import styles from "./ClientHeader.module.css";
import { checkIdentifier, type IdentifierType } from "./identifiers";

export interface ClientIdentifier {
  type: IdentifierType;
  value: string;
  /** "Maharashtra · monthly", "Company". */
  note?: string;
}

export interface ClientHeaderProps extends Omit<ComponentProps<"header">, "title"> {
  name: string;
  /** "Private limited company · Mumbai". */
  subtitle?: ReactNode;
  identifiers: ClientIdentifier[];
  logoUrl?: string;
  /** Badges after the name: tags, "Key client". */
  badges?: ReactNode;
  /** Buttons on the right. */
  actions?: ReactNode;
  /** Partner, manager. */
  people?: ReactNode;
  headingLevel?: 1 | 2;
}

/**
 * A client's name and registrations (GSTIN, PAN, CIN, TAN), each with a copy
 * button and a format check shown in words, not colour alone.
 */
export function ClientHeader({
  name,
  subtitle,
  identifiers,
  logoUrl,
  badges,
  actions,
  people,
  headingLevel = 1,
  className,
  ...rest
}: ClientHeaderProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <header className={cx(styles.header, className)} {...rest}>
      <div className={styles.top}>
        <Avatar name={name} src={logoUrl} size="xl" shape="square" />
        <div className={styles.titles}>
          <div className={styles.nameRow}>
            <Heading className={styles.name}>{name}</Heading>
            {badges}
          </div>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
      <dl className={styles.ids}>
        {identifiers.map((id) => (
          <IdentifierItem key={`${id.type}-${id.value}`} identifier={id} />
        ))}
        {people ? (
          <div className={styles.id}>
            <dt className={styles.idType}>People</dt>
            <dd className={styles.idValue}>{people}</dd>
          </div>
        ) : null}
      </dl>
    </header>
  );
}

function IdentifierItem({ identifier }: { identifier: ClientIdentifier }) {
  const check = checkIdentifier(identifier.type, identifier.value);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(identifier.value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className={styles.id}>
      <dt className={styles.idType}>{identifier.type}</dt>
      <dd className={styles.idValue}>
        <span className={cx(styles.mono, !check.valid && styles.invalid)}>{identifier.value}</span>
        {check.valid ? (
          <span className={styles.ok} title="Format looks right">
            <CheckIcon size={12} strokeWidth={2.5} />
            <span className={styles.srOnly}>Format looks right</span>
          </span>
        ) : (
          <span className={styles.warn}>
            <WarningIcon size={12} />
            <span>{check.reason}</span>
          </span>
        )}
        <Tooltip content={copied ? "Copied" : `Copy ${identifier.type}`}>
          <button
            type="button"
            className={styles.copy}
            aria-label={
              copied ? `${identifier.type} copied` : `Copy ${identifier.type} ${identifier.value}`
            }
            onClick={copy}
          >
            {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
          </button>
        </Tooltip>
        {identifier.note ? <span className={styles.note}>{identifier.note}</span> : null}
        <span className={styles.srOnly} aria-live="polite">
          {copied ? "Copied" : ""}
        </span>
      </dd>
    </div>
  );
}
