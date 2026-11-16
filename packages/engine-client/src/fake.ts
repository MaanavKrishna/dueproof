/**
 * A fake engine for tests and for running the app without the Python
 * service (ENGINE_MODE=fake). It implements EngineClient in-process:
 *
 * - inspect/read/analyze answer from recordings, keyed by the sha256 of the
 *   file behind the signed source URL. Unknown files get a plain one-page
 *   answer with no findings.
 * - read writes a placeholder image to every page-image PUT URL, as the real
 *   engine writes WebP renders.
 * - link really searches the page words for each quote, so proof works for
 *   any recording.
 *
 * `createFakeEngineHandler` serves the same fake over HTTP with the real
 * token check, to test the HTTP client end to end.
 */
import { createHash } from "node:crypto";
import { engine } from "@dueproof/contracts";
import type {
  AnalyzeResponse,
  EngineClient,
  InspectResponse,
  LinkRequest,
  LinkResponse,
  ReadResponse,
} from "./client";
import asmt10 from "./fake/recordings/notice-gst-asmt10.json" with { type: "json" };
import { verifyEngineToken } from "./token";

export interface Recording {
  name: string;
  sha256: string;
  mime: string;
  inspect: InspectResponse;
  read: ReadResponse;
  analyze: AnalyzeResponse;
}

/** Recordings that ship with the fake (see src/fake/recordings/). */
export const BUILTIN_RECORDINGS: Recording[] = [parseRecording(asmt10)];

export function parseRecording(raw: unknown): Recording {
  const r = raw as Record<string, unknown>;
  return {
    name: String(r.name),
    sha256: String(r.sha256),
    mime: String(r.mime),
    inspect: engine.InspectResponse.parse(r.inspect),
    read: engine.ReadResponse.parse(r.read),
    analyze: engine.AnalyzeResponse.parse(r.analyze),
  };
}

export interface FakeEngineOptions {
  /** Fetch the bytes behind a signed GET URL (the app passes its storage's reader). */
  fetchSource: (url: string) => Promise<Uint8Array | null>;
  /** Store bytes at a signed PUT URL (page images). Omit to skip writing images. */
  putObject?: (url: string, body: Uint8Array, contentType: string) => Promise<unknown>;
  recordings?: Recording[];
  /** Called for each engine call, for tests. */
  onCall?: (endpoint: string) => void;
}

/** A 1×1 WebP, standing in for a rendered page. */
const PLACEHOLDER_WEBP = Uint8Array.from(
  Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA", "base64"),
);

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function createFakeEngine(options: FakeEngineOptions): EngineClient {
  const recordings = options.recordings ?? BUILTIN_RECORDINGS;
  const bySha = new Map(recordings.map((r) => [r.sha256, r]));
  const lastRead = new Map<string, Recording | null>();

  async function lookup(
    sourceUrl: string,
  ): Promise<{ recording: Recording | null; bytes: Uint8Array }> {
    const bytes = await options.fetchSource(sourceUrl);
    if (!bytes) throw new Error("fake engine: source URL could not be read");
    const recording = bySha.get(sha256(bytes)) ?? null;
    return { recording, bytes };
  }

  return {
    async inspect(req) {
      options.onCall?.("inspect");
      const r = engine.InspectRequest.parse(req);
      const { recording, bytes } = await lookup(r.sourceUrl);
      if (recording) return recording.inspect;
      const isPdf = new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
      return { ok: true, pageCount: 1, encrypted: false, textLayerPages: isPdf ? [1] : [] };
    },

    async read(req) {
      options.onCall?.("read");
      const r = engine.ReadRequest.parse(req);
      const { recording } = await lookup(r.sourceUrl);
      const out: ReadResponse = recording?.read ?? {
        pages: [
          {
            page: 1,
            width: 595,
            height: 842,
            rotation: 0,
            text: "",
            words: [],
            engine: "none",
            confidence: 0,
            languages: [],
          },
        ],
        needsEscalation: [],
      };
      lastRead.set(r.sourceUrl, recording);
      if (options.putObject) {
        for (const url of r.pageImagePutUrls.slice(0, out.pages.length)) {
          await options.putObject(url, PLACEHOLDER_WEBP, "image/webp");
        }
      }
      return out;
    },

    async translate(req) {
      options.onCall?.("translate");
      const r = engine.TranslateRequest.parse(req);
      return {
        segments: r.segments.map((s) => ({ id: s.id, textEn: s.text, warn: s.lang !== "en" })),
        engine: "none",
      };
    },

    async analyze(req) {
      options.onCall?.("analyze");
      const r = engine.AnalyzeRequest.parse(req);
      const text = r.pages.map((p) => p.text).join("\n");
      const recording = recordings.find(
        (rec) => rec.read.pages.map((p) => p.text).join("\n") === text,
      );
      return recording?.analyze ?? { sections: [], findings: [], confident: false };
    },

    async link(req) {
      options.onCall?.("link");
      return linkQuotes(engine.LinkRequest.parse(req));
    },
  };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

/** Find each quote's words on the pages; one rect per line the quote spans. */
export function linkQuotes(req: LinkRequest): LinkResponse {
  const parsed = engine.LinkRequest.parse(req);
  return {
    matches: parsed.quotes.map((q) => {
      const tokens = q.text.split(/\s+/).map(norm).filter(Boolean);
      const pages = [...parsed.pages].sort(
        (a, b) => Number(b.page === q.pageHint) - Number(a.page === q.pageHint),
      );
      for (const page of pages) {
        const words = page.words.map((w) => ({ ...w, n: norm(w.text) })).filter((w) => w.n);
        for (let i = 0; tokens.length && i + tokens.length <= words.length; i++) {
          if (tokens.every((t, j) => words[i + j]?.n === t)) {
            const hit = words.slice(i, i + tokens.length);
            const byLine = new Map<number, [number, number, number, number]>();
            for (const w of hit) {
              const r = byLine.get(w.line);
              byLine.set(
                w.line,
                r
                  ? [
                      Math.min(r[0], w.rect[0]),
                      Math.min(r[1], w.rect[1]),
                      Math.max(r[2], w.rect[2]),
                      Math.max(r[3], w.rect[3]),
                    ]
                  : [...w.rect],
              );
            }
            return {
              id: q.id,
              page: page.page,
              rects: [...byLine.values()],
              score: 1,
              grade: "exact" as const,
            };
          }
        }
      }
      return { id: q.id, rects: [], score: 0, grade: "unlocated" as const };
    }),
  };
}

/** Serve an EngineClient over HTTP with the real token check: POST /v1/{endpoint}. */
export function createFakeEngineHandler(client: EngineClient, secret: string) {
  return async (request: Request): Promise<Response> => {
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!verifyEngineToken(secret, token)) return new Response("unauthorised", { status: 401 });
    if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
    const endpoint = new URL(request.url).pathname.replace(/^\/v1\//, "");
    const body = await request.json();
    try {
      switch (endpoint) {
        case "inspect":
          return Response.json(await client.inspect(body));
        case "read":
          return Response.json(await client.read(body));
        case "translate":
          return Response.json(await client.translate(body));
        case "analyze":
          return Response.json(await client.analyze(body));
        case "link":
          return Response.json(await client.link(body));
        default:
          return new Response("not found", { status: 404 });
      }
    } catch {
      return new Response("bad request", { status: 400 });
    }
  };
}
