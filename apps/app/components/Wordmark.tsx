"use client";
import styles from "./Wordmark.module.css";

/** The firm's mark and name, top left of the sidebar and the setup wizard. */
/** `compactOnPhone` shows only the mark on narrow screens (the setup wizard bar). */
export function Wordmark({
  name,
  compactOnPhone = false,
}: {
  name: string;
  compactOnPhone?: boolean;
}) {
  return (
    <span className={styles.wordmark}>
      <span aria-hidden="true" className={styles.mark} />
      <span
        className={
          compactOnPhone ? `${styles.wordmarkText} ${styles.phoneHidden}` : styles.wordmarkText
        }
      >
        {name || "Dueproof"}
      </span>
    </span>
  );
}
