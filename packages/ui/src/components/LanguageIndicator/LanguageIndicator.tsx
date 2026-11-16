import { TranslateIcon, WarningIcon } from "@dueproof/icons";
import type { ComponentProps } from "react";
import { cx } from "../../utils/cx";
import styles from "./LanguageIndicator.module.css";

export interface LanguageIndicatorProps extends Omit<ComponentProps<"div">, "children"> {
  /** The notice's language, in English: "Hindi", "Tamil". */
  language: string;
  /**
   * ok: machine translation shown, read the original to be sure.
   * warn: low confidence or partly translated — read the original.
   * unavailable: no translation (offline, model not downloaded).
   */
  state?: "ok" | "warn" | "unavailable";
  /** Opens the original text or page. */
  onShowOriginal?: () => void;
  /** Extra detail: "Translated on this device", "Confidence low on page 2". */
  detail?: string;
  size?: "sm" | "md";
}

/** "Translated from Hindi — read the original". A translation is a reading aid, never the proof. */
export function LanguageIndicator({
  language,
  state = "ok",
  onShowOriginal,
  detail,
  size = "md",
  className,
  ...rest
}: LanguageIndicatorProps) {
  const Icon_ = state === "ok" ? TranslateIcon : WarningIcon;
  const message =
    state === "ok"
      ? `Translated from ${language}`
      : state === "warn"
        ? `Translation from ${language} may be inaccurate`
        : `${language} — translation unavailable`;
  return (
    <div
      className={cx(styles.indicator, styles[state], styles[size], className)}
      role={state === "ok" ? undefined : "status"}
      {...rest}
    >
      <Icon_ size={size === "sm" ? 14 : 16} className={styles.icon} />
      <span className={styles.text}>
        <span className={styles.message}>{message}</span>
        {detail ? <span className={styles.detail}>{detail}</span> : null}
      </span>
      {onShowOriginal ? (
        <button type="button" className={styles.action} onClick={onShowOriginal}>
          Read the original
        </button>
      ) : (
        <span className={styles.hint}>— read the original</span>
      )}
    </div>
  );
}
