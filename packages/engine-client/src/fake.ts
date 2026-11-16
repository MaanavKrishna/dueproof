/**
 * A fake engine for tests and for running the app without the Python
 * service (ENGINE_MODE=fake). It implements EngineClient in-process:
 *
 * - inspect/read/analyze answer from the real engine's recordings, keyed by
 *   the sha256 of the file behind the signed source URL. Unknown files get a
 *   plain one-page answer with no findings.
 * - read writes a placeholder image to every page-image PUT URL, as the real
 *   engine writes WebP renders.
 * - link really searches the page words for each quote (spacing-insensitive,
 *   like the engine's linker), so proof works for any quote, AI ones included.
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
  PageText,
  ReadResponse,
} from "./client";
import { RAW_RECORDINGS } from "./fake/recordings";
import { verifyEngineToken } from "./token";

/**
 * The real engine's answers for one fixture file, keyed by the file's sha256.
 * A file the engine refuses at inspect (an encrypted PDF) has no read,
 * analyze or link. `link` is the engine's answer for the analyze findings'
 * quotes (ids `f0`, `f1`, ...), kept to check the fake linker against.
 */
export interface Recording {
  name: string;
  sha256: string;
  mime: string;
  inspect: InspectResponse;
  read?: ReadResponse;
  analyze?: AnalyzeResponse;
  link?: LinkResponse;
}

export function parseRecording(raw: unknown): Recording {
  const r = raw as Record<string, unknown>;
  return {
    name: String(r.name),
    sha256: String(r.sha256),
    mime: String(r.mime),
    inspect: engine.InspectResponse.parse(r.inspect),
    ...(r.read ? { read: engine.ReadResponse.parse(r.read) } : {}),
    ...(r.analyze ? { analyze: engine.AnalyzeResponse.parse(r.analyze) } : {}),
    ...(r.link ? { link: engine.LinkResponse.parse(r.link) } : {}),
  };
}

/**
 * Recordings that ship with the fake: the real engine's responses for every
 * fixture in services/engine/tests/fixtures (scripts/sync-recordings.mjs).
 */
export const BUILTIN_RECORDINGS: Recording[] = RAW_RECORDINGS.map(parseRecording);

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
      if (isPdf && !r.password && Buffer.from(bytes).includes("/Encrypt")) {
        return {
          ok: false,
          pageCount: 0,
          encrypted: true,
          textLayerPages: [],
          reason: "encrypted",
        };
      }
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
        (rec) => rec.analyze && rec.read?.pages.map((p) => p.text).join("\n") === text,
      );
      return recording?.analyze ?? { sections: [], findings: [], confident: false };
    },

    async link(req) {
      options.onCall?.("link");
      return linkQuotes(engine.LinkRequest.parse(req));
    },
  };
}

/**
 * Letters, combining marks and digits only, in any script, case-folded, as
 * the engine's linker does (`services/engine/dueproof_engine/pipeline/link.py`,
 * `_norm`). Vowel signs in Indic scripts are marks, so they are kept.
 */
const normWord = (s: string) =>
  s
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\p{N}_]+/gu, "")
    .toLowerCase();

/** Below this many normalised characters a quote is too short to prove anything (link.py). */
const MIN_QUOTE_CHARS = 6;

interface PageIndex {
  page: number;
  /** Every word's normalised text, concatenated with no spaces. */
  hay: string;
  /** [start, end) in `hay` for each word that has any text, with its index. */
  spans: { start: number; end: number; word: number }[];
  words: PageText["words"];
}

function indexPage(page: PageText): PageIndex {
  let hay = "";
  const spans: PageIndex["spans"] = [];
  page.words.forEach((w, word) => {
    const n = normWord(w.text);
    if (!n) return;
    spans.push({ start: hay.length, end: hay.length + n.length, word });
    hay += n;
  });
  return { page: page.page, hay, spans, words: page.words };
}

/** One rect per line of the matched words. */
function rectsFor(words: PageText["words"], indices: number[]) {
  const byLine = new Map<number, [number, number, number, number]>();
  for (const i of indices) {
    const w = words[i];
    if (!w) continue;
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
  return [...byLine.values()];
}

/**
 * Find each quote on the pages; one rect per line the quote spans.
 *
 * Matching is spacing-insensitive, like the engine's linker: page words and
 * the quote are normalised and joined with no spaces, so a quote still
 * matches when the page's `text` and its `words` split a word differently
 * (Malayalam "മെട്രോറെയിൽ" in the text layer, "മെട്രോ" + "റെയിൽ" as words) or
 * OCR dropped a space. Verbatim matches only: the fake has no fuzzy fallback,
 * so what it can't find exactly is `unlocated`.
 */
export function linkQuotes(req: LinkRequest): LinkResponse {
  const parsed = engine.LinkRequest.parse(req);
  const index = parsed.pages.map(indexPage);
  return {
    matches: parsed.quotes.map((q) => {
      const needle = q.text.split(/\s+/).map(normWord).join("");
      if (needle.length >= MIN_QUOTE_CHARS) {
        const pages = [...index].sort(
          (a, b) =>
            Number(b.page === q.pageHint) - Number(a.page === q.pageHint) || a.page - b.page,
        );
        for (const p of pages) {
          const start = p.hay.indexOf(needle);
          if (start < 0) continue;
          const end = start + needle.length;
          const hit = p.spans.filter((s) => s.start < end && s.end > start).map((s) => s.word);
          if (!hit.length) continue;
          return {
            id: q.id,
            page: p.page,
            rects: rectsFor(p.words, hit),
            score: 1,
            grade: "exact" as const,
          };
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
