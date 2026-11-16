/**
 * The Python engine's HTTP contract (services/engine). The engine is
 * stateless: it reads from signed URLs, writes page images to signed PUT
 * URLs, and never touches the database. The TypeScript workflow calls:
 *
 *   POST /v1/inspect   → page count, encryption, which pages have a text layer
 *   POST /v1/read      → per-page text and word boxes (PDFium or OCR ladder)
 *   POST /v1/translate → English for non-English segments (IndicTrans2)
 *   POST /v1/analyze   → rule-based findings with verbatim quotes and DateRules
 *   POST /v1/link      → locate quotes on pages (the proof)
 *
 * All requests carry `Authorization: Bearer <short-lived signed token>`.
 */
import { z } from "zod";
import { DateRule } from "./date-rule";
import { FindingKind, IsoDate, Rect, Verification } from "./domain";

export const ENGINE_API_VERSION = "v1";

export const SupportedMime = z.enum(["application/pdf", "image/jpeg", "image/png", "image/tiff"]);

export const InspectRequest = z.object({
  sourceUrl: z.string().url(),
  mime: SupportedMime,
  password: z.string().optional(),
});
export const InspectResponse = z.object({
  ok: z.boolean(),
  pageCount: z.number().int().nonnegative(),
  encrypted: z.boolean(),
  /** 1-based page numbers that have a usable text layer. */
  textLayerPages: z.array(z.number().int().positive()),
  /** Set when ok=false: "encrypted", "malformed", "too_large", "too_many_pages", "unsupported". */
  reason: z.string().optional(),
});

/** One word on a page with its box and the line it belongs to. */
export const Word = z.object({
  text: z.string(),
  rect: Rect,
  line: z.number().int().nonnegative(),
});

export const OcrEngine = z.enum(["text_layer", "paddleocr", "tesseract", "vision", "none"]);

export const PageText = z.object({
  page: z.number().int().positive(),
  width: z.number(),
  height: z.number(),
  rotation: z.number().default(0),
  text: z.string(),
  words: z.array(Word),
  engine: OcrEngine,
  /** 0–1. Below the configured bar the workflow may escalate (03 §6a). */
  confidence: z.number().min(0).max(1),
  /** BCP-47-ish script/language guesses, e.g. ["ml", "en"]. */
  languages: z.array(z.string()),
});
export type PageText = z.infer<typeof PageText>;

export const ReadRequest = z.object({
  sourceUrl: z.string().url(),
  mime: SupportedMime,
  password: z.string().optional(),
  /** One presigned PUT URL per page (index 0 = page 1) for the rendered page image (WebP). */
  pageImagePutUrls: z.array(z.string().url()),
  /** Language hints for OCR, e.g. ["en", "hi", "ml"]. */
  languages: z.array(z.string()).default(["en"]),
  /** Highest OCR rung this deployment may use; engine-fast stops at paddleocr. */
  maxRung: OcrEngine.default("tesseract"),
});
export const ReadResponse = z.object({
  pages: z.array(PageText),
  /** Pages the engine could not read at the allowed rungs (escalate to engine-heavy or vision). */
  needsEscalation: z.array(z.number().int().positive()).default([]),
});
export type ReadResponse = z.infer<typeof ReadResponse>;

export const TranslateRequest = z.object({
  segments: z.array(z.object({ id: z.string(), text: z.string(), lang: z.string() })),
});
export const TranslateResponse = z.object({
  segments: z.array(
    z.object({
      id: z.string(),
      textEn: z.string(),
      /** The terminology/number check failed: read the original. */
      warn: z.boolean().default(false),
    }),
  ),
  engine: z.enum(["indictrans2", "none"]),
});

/** A rule-based finding. Quotes are verbatim from the page text (original language). */
export const EngineFinding = z.object({
  kind: FindingKind,
  text: z.string(),
  textEn: z.string().optional(),
  quote: z.string(),
  quoteLang: z.string().default("en"),
  pageHint: z.number().int().positive().optional(),
  confidence: z.number().min(0).max(1),
  dueRule: DateRule.optional(),
  /** The engine's own date, used only to cross-check the TS date engine in tests. */
  engineDueOn: IsoDate.optional(),
  amountMinor: z.number().int().optional(),
  desk: z.string().optional(),
  severity: z.enum(["low", "medium", "high"]).optional(),
});
export type EngineFinding = z.infer<typeof EngineFinding>;

export const AnalyzeRequest = z.object({
  pages: z.array(PageText),
  /** English per segment when translated, keyed by "page:line". */
  translations: z.record(z.string(), z.string()).default({}),
  profile: z.string().default("notices_in"),
  receivedOn: IsoDate.optional(),
});
export const AnalyzeResponse = z.object({
  docType: z.string().optional(),
  title: z.string().optional(),
  reference: z.string().optional(),
  issuingOffice: z.string().optional(),
  issuedOn: IsoDate.optional(),
  sections: z.array(z.string()).default([]),
  findings: z.array(EngineFinding),
  /** True when the profile recognised the notice type with high confidence (AI may be skipped). */
  confident: z.boolean(),
});
export type AnalyzeResponse = z.infer<typeof AnalyzeResponse>;

export const LinkRequest = z.object({
  pages: z.array(PageText),
  quotes: z.array(
    z.object({ id: z.string(), text: z.string(), pageHint: z.number().int().optional() }),
  ),
});
export const LinkResponse = z.object({
  matches: z.array(
    z.object({
      id: z.string(),
      page: z.number().int().positive().optional(),
      rects: z.array(Rect),
      score: z.number().min(0).max(1),
      grade: Verification,
    }),
  ),
});
export type LinkResponse = z.infer<typeof LinkResponse>;
