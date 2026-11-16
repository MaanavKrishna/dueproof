/**
 * GET /api/v1/documents/{id}/events — server-sent events with the
 * document's processing status. Sends the current status at once, then each
 * change from the in-process emitter, with a database poll as a backstop
 * (another process may be running the step). Closes after a final status.
 *
 *   event: status
 *   data: {"status":"reading","detail":"read","at":"…"}
 */
import { authorizeRequest } from "@/lib/authorize";
import { getDocumentStatus } from "@/lib/documents";
import { errorResponse } from "@/lib/errors";
import { subscribeDocumentStatus, TERMINAL_STATUSES } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_MS = 2_000;
const HEARTBEAT_MS = 15_000;
const MAX_OPEN_MS = 10 * 60_000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  let ctx: Awaited<ReturnType<typeof authorizeRequest>>;
  let id: string;
  try {
    ctx = await authorizeRequest(request, "document.read");
    id = (await params).id;
    await getDocumentStatus(ctx, id); // 404 before opening the stream
  } catch (e) {
    return errorResponse(e);
  }

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let last = "";
      let closed = false;
      const send = (status: string, detail: string | null | undefined, at: string) => {
        const key = `${status}|${detail ?? ""}`;
        if (closed || key === last) return;
        last = key;
        controller.enqueue(
          encoder.encode(`event: status\ndata: ${JSON.stringify({ status, detail, at })}\n\n`),
        );
        if ((TERMINAL_STATUSES as readonly string[]).includes(status)) close();
      };
      const poll = async () => {
        try {
          const s = await getDocumentStatus(ctx, id);
          send(s.status, s.statusDetail, new Date().toISOString());
        } catch {
          close();
        }
      };
      const unsubscribe = subscribeDocumentStatus(ctx.orgId, id, (e) =>
        send(e.status, e.detail, e.at),
      );
      const pollTimer = setInterval(poll, POLL_MS);
      const beat = setInterval(
        () => !closed && controller.enqueue(encoder.encode(": keep-alive\n\n")),
        HEARTBEAT_MS,
      );
      const limit = setTimeout(() => close(), MAX_OPEN_MS);
      function close() {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(pollTimer);
        clearInterval(beat);
        clearTimeout(limit);
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      }
      cleanup = close;
      request.signal.addEventListener("abort", close);
      void poll();
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
