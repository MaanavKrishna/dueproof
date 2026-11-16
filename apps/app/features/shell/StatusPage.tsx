"use client";
/**
 * Whole-page states in the Ledger style: not found and something went wrong.
 * Plain words, and one next step (01 §4 "When things go wrong").
 */
import { ErrorIcon, RefreshIcon, SearchIcon } from "@dueproof/icons";
import { Button, EmptyState, VisuallyHidden } from "@dueproof/ui";
import NextLink from "next/link";
import styles from "./StatusPage.module.css";

export function NotFoundState() {
  return (
    <main className={styles.page} id="dp-main">
      <VisuallyHidden>
        <h1>Page not found</h1>
      </VisuallyHidden>
      <EmptyState
        size="hero"
        icon={SearchIcon}
        title="We couldn't find that page"
        description="The link may be old, or the item may have been removed. Nothing you saved is lost."
        actions={
          <NextLink href="/today" className={styles.link}>
            Go to Today
          </NextLink>
        }
      />
    </main>
  );
}

export function ErrorState({ reset, digest }: { reset?: () => void; digest?: string | undefined }) {
  return (
    <div className={styles.page}>
      <EmptyState
        size="hero"
        icon={ErrorIcon}
        title="Something went wrong"
        description={
          <>
            We couldn't show this page. Your work is saved; try again in a moment.
            {digest ? (
              <span className={styles.ref}>
                Reference for support: <code>{digest}</code>
              </span>
            ) : null}
          </>
        }
        actions={
          <>
            {reset ? (
              <Button variant="primary" icon={RefreshIcon} onClick={reset}>
                Try again
              </Button>
            ) : null}
            <NextLink href="/today" className={styles.link}>
              Go to Today
            </NextLink>
          </>
        }
      />
    </div>
  );
}
