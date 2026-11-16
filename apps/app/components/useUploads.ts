"use client";
/**
 * Upload tray state: hash → init → signed PUT → complete, then live status
 * over server-sent events (/api/v1/documents/{id}/events) until the
 * document settles. Used by the Inbox and the case page's thread.
 */
import type { UploadItem, UploadStage } from "@dueproof/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { retryDocument, unlockDocument } from "@/app/actions/documents";
import { finishUpload, startUpload } from "@/app/actions/upload";

export type UploadRole = "notice" | "reply" | "acknowledgement" | "order" | "appeal" | "attachment";

export interface TrackedUpload extends UploadItem {
  documentId?: string;
  file?: File;
}

const FINAL = new Set(["ready", "needs_review", "needs_password", "failed", "quarantined"]);

/** Pipeline status (03 §6) → the tray's stage. */
export function stageOf(status: string): UploadStage {
  switch (status) {
    case "received":
      return "uploading";
    case "stored":
    case "reading":
      return "reading";
    case "translating":
      return "translating";
    case "extracting":
    case "ai_assist":
      return "finding";
    case "linking":
    case "reconciling":
      return "checking";
    case "ready":
      return "done";
    case "needs_review":
    case "needs_password":
    case "failed":
    case "quarantined":
      return status;
    default:
      return "reading";
  }
}

const FAILURE_WORDS: Record<string, string | undefined> & { quarantined: string } = {
  quarantined: "The file failed the safety checks. An admin can review it.",
  failed: "It couldn't be read. Retry, or download the original and check it.",
  needs_password: "This PDF needs a password.",
};

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface UseUploadsOptions {
  role?: UploadRole;
  caseId?: string;
  /** Called once a document settles (to refresh server data). */
  onSettled?: (documentId: string, status: string) => void;
  /** Documents already processing, from the server, to keep watching. */
  initial?: TrackedUpload[];
}

export function useUploads(options: UseUploadsOptions = {}) {
  const [items, setItems] = useState<TrackedUpload[]>(options.initial ?? []);
  const sources = useRef(new Map<string, EventSource>());
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const patch = useCallback((id: string, p: Partial<TrackedUpload>) => {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...p } : i)));
  }, []);

  const watch = useCallback(
    (id: string, documentId: string) => {
      sources.current.get(id)?.close();
      const es = new EventSource(`/api/v1/documents/${documentId}/events`);
      sources.current.set(id, es);
      es.addEventListener("status", (ev) => {
        const data = JSON.parse((ev as MessageEvent<string>).data) as {
          status: string;
          detail?: string | null;
        };
        const stage = stageOf(data.status);
        const error = FAILURE_WORDS[data.status];
        patch(id, {
          stage,
          ...(error ? { error } : {}),
          ...(data.status === "ready" && data.detail ? { detail: data.detail } : {}),
        });
        if (FINAL.has(data.status)) {
          es.close();
          sources.current.delete(id);
          optionsRef.current.onSettled?.(documentId, data.status);
        }
      });
      es.onerror = () => {
        es.close();
        sources.current.delete(id);
      };
    },
    [patch],
  );

  useEffect(() => {
    for (const i of optionsRef.current.initial ?? []) {
      if (i.documentId && !FINAL.has(i.stage === "done" ? "ready" : i.stage))
        watch(i.id, i.documentId);
    }
    const map = sources.current;
    return () => {
      for (const es of map.values()) es.close();
      map.clear();
    };
  }, [watch]);

  const send = useCallback(
    async (id: string, file: File) => {
      const o = optionsRef.current;
      patch(id, { stage: "uploading", progress: 0 });
      const init = await startUpload({
        filename: file.name,
        size: file.size,
        mime: file.type || "application/pdf",
        sha256: await sha256Hex(file),
        ...(o.role ? { role: o.role } : {}),
        ...(o.caseId ? { caseId: o.caseId } : {}),
      });
      if (!init.ok) return patch(id, { stage: "failed", error: init.message });
      const documentId = init.data.documentId;
      if (init.data.status === "duplicate") {
        return patch(id, { stage: "duplicate", documentId, detail: "Already in the register" });
      }
      patch(id, { documentId, progress: 0.3 });
      const put = await fetch(init.data.upload.url, {
        method: "PUT",
        headers: init.data.upload.headers,
        body: file,
      });
      if (!put.ok) return patch(id, { stage: "failed", error: "The upload didn't finish. Retry." });
      patch(id, { progress: 0.9 });
      const done = await finishUpload(documentId);
      if (!done.ok) return patch(id, { stage: "failed", error: done.message });
      if (done.data.status === "quarantined")
        return patch(id, { stage: "quarantined", error: FAILURE_WORDS.quarantined });
      patch(id, { stage: "reading", progress: 1 });
      watch(id, documentId);
    },
    [patch, watch],
  );

  const add = useCallback(
    (files: File[]) => {
      const fresh = files.map((file) => ({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        size: file.size,
        stage: "queued" as UploadStage,
        file,
      }));
      setItems((list) => [...fresh, ...list]);
      // One at a time keeps hashing and PUTs from fighting for bandwidth.
      void (async () => {
        for (const f of fresh) await send(f.id, f.file);
      })();
    },
    [send],
  );

  const retry = useCallback(
    async (id: string) => {
      const item = items.find((i) => i.id === id);
      if (!item) return;
      if (item.documentId && item.stage === "failed") {
        const r = await retryDocument(item.documentId);
        if (!r.ok) return patch(id, { error: r.message });
        patch(id, { stage: "reading" });
        return watch(id, item.documentId);
      }
      if (item.file) await send(id, item.file);
    },
    [items, patch, send, watch],
  );

  const unlock = useCallback(
    async (id: string, password: string): Promise<string | null> => {
      const item = items.find((i) => i.id === id);
      if (!item?.documentId) return "This upload has no document yet.";
      const r = await unlockDocument({ documentId: item.documentId, password });
      if (!r.ok) return r.message;
      patch(id, { stage: "reading" });
      watch(id, item.documentId);
      return null;
    },
    [items, patch, watch],
  );

  const remove = useCallback((id: string) => {
    sources.current.get(id)?.close();
    sources.current.delete(id);
    setItems((list) => list.filter((i) => i.id !== id));
  }, []);

  const clearDone = useCallback(() => {
    setItems((list) => list.filter((i) => !["done", "duplicate"].includes(i.stage)));
  }, []);

  return { items, add, retry, unlock, remove, clearDone };
}
