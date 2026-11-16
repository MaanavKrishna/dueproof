"use client";
/** Loads (and caches per document) the proof viewer's pages for the inspector. */
import { useEffect, useState } from "react";
import { getProof } from "@/app/actions/proof";
import type { ProofData } from "@/lib/proof";

export function useProof(documentId: string | null | undefined) {
  const [cache, setCache] = useState<Record<string, ProofData>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!documentId || cache[documentId]) return;
    let live = true;
    setError(null);
    getProof(documentId).then((r) => {
      if (!live) return;
      if (r.ok) setCache((c) => ({ ...c, [documentId]: r.data }));
      else setError(r.message);
    });
    return () => {
      live = false;
    };
  }, [documentId, cache]);
  return { proof: documentId ? (cache[documentId] ?? null) : null, error };
}
