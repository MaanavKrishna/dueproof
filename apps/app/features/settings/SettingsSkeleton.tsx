"use client";
import { Skeleton, SkeletonText } from "@dueproof/ui";
import styles from "./settings.module.css";

/** While a Settings section loads: the title and a few rows, in place. */
export function SettingsSkeleton() {
  return (
    <div className={styles.skeleton} role="status" aria-busy="true" aria-label="Loading settings">
      <Skeleton shape="text" className={styles.skeletonTitle} />
      <div className={styles.skeletonBody}>
        <div className={styles.skeletonNav}>
          {Array.from({ length: 6 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders.
            <Skeleton key={i} shape="text" />
          ))}
        </div>
        <div className={styles.skeletonForms}>
          <Skeleton shape="rect" className={styles.skeletonCard} />
          <SkeletonText lines={3} />
          <Skeleton shape="rect" className={styles.skeletonCard} />
        </div>
      </div>
    </div>
  );
}
