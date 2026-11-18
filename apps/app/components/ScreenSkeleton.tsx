"use client";
import { Grid, ListPageTemplate, Skeleton, SkeletonText } from "@dueproof/ui";
import styles from "./screen.module.css";

const KEYS = ["a", "b", "c", "d", "e", "f"];

/** Suspense fallback for a screen: its title, and grey bars where the content will be. */
export function ScreenSkeleton({ title, cards = 4 }: { title: string; cards?: number }) {
  return (
    <ListPageTemplate title={title} subtitle="Loading…" scrollPage>
      <div className={styles.content} aria-busy="true">
        <Grid min="panel" maxColumns={4} align="start">
          {KEYS.slice(0, cards).map((k) => (
            <div key={k} className={styles.stackTight}>
              <Skeleton shape="text" width="40%" />
              <SkeletonText lines={4} />
            </div>
          ))}
        </Grid>
      </div>
    </ListPageTemplate>
  );
}
