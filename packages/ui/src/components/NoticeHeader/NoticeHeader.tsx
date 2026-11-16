import type { MinorAmount } from "@dueproof/i18n";
import {
  CourtIcon,
  EditIcon,
  GstIcon,
  HistoryIcon,
  type Icon,
  IncomeTaxIcon,
  NoticeIcon,
  RbiIcon,
  RocIcon,
  SebiIcon,
} from "@dueproof/icons";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../../utils/cx";
import { Amount } from "../Amount/Amount";
import { Avatar } from "../Avatar/Avatar";
import { type CaseStage, caseStages } from "../StageStepper/StageStepper";
import { Tooltip } from "../Tooltip/Tooltip";
import styles from "./NoticeHeader.module.css";

export type NoticeAuthority = "gst" | "income-tax" | "roc" | "court" | "sebi" | "rbi" | "other";

const authorityIcon: Record<NoticeAuthority, Icon> = {
  gst: GstIcon,
  "income-tax": IncomeTaxIcon,
  roc: RocIcon,
  court: CourtIcon,
  sebi: SebiIcon,
  rbi: RbiIcon,
  other: NoticeIcon,
};

export interface NoticeHeaderProps extends Omit<ComponentProps<"header">, "title"> {
  authority: NoticeAuthority;
  /** "GST · ASMT-10 · Scrutiny of returns". */
  type: string;
  /** "ZD2710240012345". */
  reference: string;
  /** "DIN 20241027…", shown under the reference. */
  din?: string;
  /** "Office of the Superintendent, CGST Range IV, Mumbai East". */
  issuingOffice: string;
  /** Amount demanded, integer paise. */
  amount?: MinorAmount;
  /** Sections cited: ["Section 61", "Rule 99"]. */
  sections?: string[];
  /** Received date, formatted: "24 Oct 2026". */
  received: string;
  /** The received date was corrected by a person (the original is kept in history). */
  receivedCorrected?: boolean;
  onEditReceived?: () => void;
  onShowReceivedHistory?: () => void;
  client: { name: string; identifier?: string; href?: string };
  owner?: { name: string; avatarUrl?: string };
  stage: CaseStage;
  /** A LanguageIndicator, labels, the AI badge. */
  badges?: ReactNode;
  /** Primary actions on the right. */
  actions?: ReactNode;
  headingLevel?: 1 | 2;
}

/**
 * The top of the case page: what the notice is, who issued it, the demand,
 * the sections, when it was received (editable, with history), the client,
 * owner and stage.
 */
export function NoticeHeader({
  authority,
  type,
  reference,
  din,
  issuingOffice,
  amount,
  sections = [],
  received,
  receivedCorrected = false,
  onEditReceived,
  onShowReceivedHistory,
  client,
  owner,
  stage,
  badges,
  actions,
  headingLevel = 1,
  className,
  ...rest
}: NoticeHeaderProps) {
  const AIcon = authorityIcon[authority];
  const Heading = `h${headingLevel}` as const;
  const stageLabel = caseStages.find((s) => s.id === stage)?.label ?? stage;
  return (
    <header className={cx(styles.header, className)} {...rest}>
      <div className={styles.top}>
        <span className={styles.authority} aria-hidden="true">
          <AIcon size={22} />
        </span>
        <div className={styles.titles}>
          <p className={styles.type}>{type}</p>
          <Heading className={styles.reference}>
            <span className={styles.srOnly}>Reference </span>
            {reference}
          </Heading>
          {din ? <p className={styles.din}>{din}</p> : null}
          {badges ? <div className={styles.badges}>{badges}</div> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
      <dl className={styles.facts}>
        <div className={cx(styles.fact, styles.wide)}>
          <dt>Issued by</dt>
          <dd>{issuingOffice}</dd>
        </div>
        {amount !== undefined ? (
          <div className={styles.fact}>
            <dt>Amount demanded</dt>
            <dd>
              <Amount minor={amount} size="lg" />
              <span className={styles.compact}>
                <Amount minor={amount} compact size="sm" tone="muted" />
              </span>
            </dd>
          </div>
        ) : null}
        {sections.length ? (
          <div className={styles.fact}>
            <dt>Sections</dt>
            <dd className={styles.sections}>
              {sections.map((s) => (
                <span key={s} className={styles.section}>
                  {s}
                </span>
              ))}
            </dd>
          </div>
        ) : null}
        <div className={styles.fact}>
          <dt>Received</dt>
          <dd className={styles.received}>
            <span className={styles.receivedDate}>{received}</span>
            {receivedCorrected ? <span className={styles.corrected}>corrected</span> : null}
            {onEditReceived ? (
              <Tooltip content="Correct the received date">
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`Correct the received date, ${received}`}
                  onClick={onEditReceived}
                >
                  <EditIcon size={14} />
                </button>
              </Tooltip>
            ) : null}
            {onShowReceivedHistory ? (
              <button type="button" className={styles.link} onClick={onShowReceivedHistory}>
                <HistoryIcon size={14} />
                History
              </button>
            ) : null}
          </dd>
        </div>
        <div className={styles.fact}>
          <dt>Client</dt>
          <dd className={styles.clientValue}>
            {client.href ? (
              <a href={client.href} className={styles.clientLink}>
                {client.name}
              </a>
            ) : (
              <span>{client.name}</span>
            )}
            {client.identifier ? <span className={styles.mono}>{client.identifier}</span> : null}
          </dd>
        </div>
        <div className={styles.fact}>
          <dt>Owner</dt>
          <dd className={styles.owner}>
            {owner ? (
              <>
                <Avatar name={owner.name} src={owner.avatarUrl} size="xs" />
                {owner.name}
              </>
            ) : (
              <span className={styles.muted}>Unassigned</span>
            )}
          </dd>
        </div>
        <div className={styles.fact}>
          <dt>Stage</dt>
          <dd>
            <span className={styles.stage} data-stage={stage}>
              {stageLabel}
            </span>
          </dd>
        </div>
      </dl>
    </header>
  );
}
