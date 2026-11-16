"use client";
import { ErrorIcon } from "@dueproof/icons";
import { Button, EmptyState } from "@dueproof/ui";

/** Error boundary content for a screen: what happened, and a retry. Never the error's text. */
export function ScreenError({ what, reset }: { what: string; reset: () => void }) {
  return (
    <div>
      <EmptyState
        icon={ErrorIcon}
        size="hero"
        headingLevel={2}
        title={`${what} couldn't be loaded`}
        description="Nothing was lost. Check your connection and try again."
        actions={
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
