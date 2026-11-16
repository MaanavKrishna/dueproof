"use client";
/**
 * The page behind a finding, in a sheet: Today's proof icon and the Inbox
 * open this. It loads the document's pages (signed image URLs) on open and
 * focuses the finding's highlight.
 */
import { ErrorIcon } from "@dueproof/icons";
import { Button, EmptyState, ProofViewer, Sheet, Skeleton } from "@dueproof/ui";
import { useEffect, useState } from "react";
import { getProof } from "@/app/actions/proof";
import type { ProofData } from "@/lib/proof";
import styles from "./screen.module.css";

export interface ProofTarget {
  documentId: string;
  findingId?: string | null;
  title: string;
  caseHref?: string | null;
}

export function ProofSheet({
  target,
  onClose,
}: {
  target: ProofTarget | null;
  onClose: () => void;
}) {
  const [proof, setProof] = useState<ProofData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const documentId = target?.documentId;
  const findingId = target?.findingId ?? null;

  useEffect(() => {
    if (!documentId) return;
    let live = true;
    setProof(null);
    setError(null);
    setActive(findingId);
    getProof(documentId).then((r) => {
      if (!live) return;
      if (r.ok) setProof(r.data);
      else setError(r.message);
    });
    return () => {
      live = false;
    };
  }, [documentId, findingId]);

  const page = proof?.highlights.find((h) => h.id === active)?.page ?? 1;
  return (
    <Sheet
      open={target !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={target?.title ?? "The page"}
      description="The highlighted passage is where this was found."
      footer={
        target?.caseHref ? (
          <Button variant="secondary" onClick={() => window.location.assign(target.caseHref ?? "")}>
            Open case
          </Button>
        ) : undefined
      }
    >
      <div className={styles.proofFill}>
        {error ? (
          <EmptyState
            icon={ErrorIcon}
            size="compact"
            title="The page couldn't be loaded"
            description={error}
          />
        ) : proof ? (
          proof.pages.length ? (
            <ProofViewer
              title={proof.title}
              pages={proof.pages}
              highlights={proof.highlights}
              activeHighlightId={active}
              onActiveHighlightChange={setActive}
              defaultPage={page}
              pageStrip={false}
              defaultZoom="fit-width"
            />
          ) : (
            <EmptyState
              size="compact"
              title="No pages yet"
              description="This document is still being read."
            />
          )
        ) : (
          <Skeleton shape="rect" width="100%" height="100%" aria-label="Loading the page" />
        )}
      </div>
    </Sheet>
  );
}
