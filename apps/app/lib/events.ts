/**
 * In-process document status events (03 §7: desktop and dev use in-process
 * events; self-hosted moves to LISTEN/NOTIFY, hosted follows the run's
 * stream). The SSE route also polls the database, so a status written by
 * another process still arrives, a little later.
 */
import { EventEmitter } from "node:events";
import type { DocumentStatus } from "@dueproof/contracts";

export interface DocumentStatusEvent {
  orgId: string;
  documentId: string;
  status: DocumentStatus;
  detail?: string | null;
  at: string;
}

const KEY = Symbol.for("dueproof.documentEvents");
type Holder = { [KEY]?: EventEmitter };

function emitter(): EventEmitter {
  const g = globalThis as Holder;
  if (!g[KEY]) {
    g[KEY] = new EventEmitter();
    g[KEY].setMaxListeners(0);
  }
  return g[KEY];
}

const channel = (orgId: string, documentId: string) => `${orgId}:${documentId}`;

export function publishDocumentStatus(event: DocumentStatusEvent): void {
  emitter().emit(channel(event.orgId, event.documentId), event);
}

export function subscribeDocumentStatus(
  orgId: string,
  documentId: string,
  listener: (event: DocumentStatusEvent) => void,
): () => void {
  const ch = channel(orgId, documentId);
  emitter().on(ch, listener);
  return () => emitter().off(ch, listener);
}

export const TERMINAL_STATUSES: readonly DocumentStatus[] = [
  "ready",
  "needs_review",
  "failed",
  "quarantined",
];
