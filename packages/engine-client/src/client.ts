/**
 * Typed HTTP client for services/engine (packages/contracts/src/engine.ts).
 * Requests are validated before they leave and responses before they're
 * trusted; every call carries a fresh short-lived bearer token.
 */
import { engine } from "@dueproof/contracts";
import type { z } from "zod";
import { DEFAULT_TOKEN_TTL_SECONDS, signEngineToken } from "./token";

export type InspectRequest = z.input<typeof engine.InspectRequest>;
export type InspectResponse = z.output<typeof engine.InspectResponse>;
export type ReadRequest = z.input<typeof engine.ReadRequest>;
export type ReadResponse = z.output<typeof engine.ReadResponse>;
export type TranslateRequest = z.input<typeof engine.TranslateRequest>;
export type TranslateResponse = z.output<typeof engine.TranslateResponse>;
export type AnalyzeRequest = z.input<typeof engine.AnalyzeRequest>;
export type AnalyzeResponse = z.output<typeof engine.AnalyzeResponse>;
export type LinkRequest = z.input<typeof engine.LinkRequest>;
export type LinkResponse = z.output<typeof engine.LinkResponse>;
export type PageText = z.output<typeof engine.PageText>;
export type EngineFinding = z.output<typeof engine.EngineFinding>;

/** The engine as the workflow sees it. The HTTP client and the fake both implement this. */
export interface EngineClient {
  inspect(req: InspectRequest): Promise<InspectResponse>;
  read(req: ReadRequest): Promise<ReadResponse>;
  translate(req: TranslateRequest): Promise<TranslateResponse>;
  analyze(req: AnalyzeRequest): Promise<AnalyzeResponse>;
  link(req: LinkRequest): Promise<LinkResponse>;
}

export class EngineError extends Error {
  override name = "EngineError";
  constructor(
    message: string,
    readonly endpoint: string,
    readonly status?: number,
    /** True when retrying may help (network, 5xx, 429). */
    readonly retryable: boolean = false,
  ) {
    super(message);
  }
}

export interface EngineClientOptions {
  /** e.g. "http://engine:8000" (self-hosted) or the engine-fast URL (hosted). */
  baseUrl: string;
  /** ENGINE_SHARED_SECRET. */
  secret: string;
  fetch?: typeof fetch;
  /** Per-request timeout. Default 120 s (reading a long scan takes a while). */
  timeoutMs?: number;
  tokenTtlSeconds?: number;
}

type Endpoint = "inspect" | "read" | "translate" | "analyze" | "link";

const SCHEMAS = {
  inspect: [engine.InspectRequest, engine.InspectResponse],
  read: [engine.ReadRequest, engine.ReadResponse],
  translate: [engine.TranslateRequest, engine.TranslateResponse],
  analyze: [engine.AnalyzeRequest, engine.AnalyzeResponse],
  link: [engine.LinkRequest, engine.LinkResponse],
} as const;

export function createEngineClient(options: EngineClientOptions): EngineClient {
  const base = options.baseUrl.replace(/\/+$/, "");
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 120_000;

  async function call<E extends Endpoint>(
    endpoint: E,
    input: z.input<(typeof SCHEMAS)[E][0]>,
  ): Promise<z.output<(typeof SCHEMAS)[E][1]>> {
    const [reqSchema, resSchema] = SCHEMAS[endpoint];
    const parsed = reqSchema.safeParse(input);
    if (!parsed.success) {
      throw new EngineError(`invalid ${endpoint} request: ${parsed.error.message}`, endpoint);
    }
    const token = signEngineToken(options.secret, {
      ttlSeconds: options.tokenTtlSeconds ?? DEFAULT_TOKEN_TTL_SECONDS,
    });
    let res: Response;
    try {
      res = await doFetch(`${base}/${engine.ENGINE_API_VERSION}/${endpoint}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(parsed.data),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw new EngineError(
        `engine ${endpoint} unreachable: ${(e as Error).message}`,
        endpoint,
        undefined,
        true,
      );
    }
    if (!res.ok) {
      // Never echo the body into logs: it may quote document text.
      throw new EngineError(
        `engine ${endpoint} failed with ${res.status}`,
        endpoint,
        res.status,
        res.status >= 500 || res.status === 429,
      );
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new EngineError(`engine ${endpoint} returned invalid JSON`, endpoint, res.status, true);
    }
    const out = resSchema.safeParse(json);
    if (!out.success) {
      throw new EngineError(
        `engine ${endpoint} response broke the contract: ${out.error.message}`,
        endpoint,
      );
    }
    return out.data as z.output<(typeof SCHEMAS)[E][1]>;
  }

  return {
    inspect: (req) => call("inspect", req),
    read: (req) => call("read", req),
    translate: (req) => call("translate", req),
    analyze: (req) => call("analyze", req),
    link: (req) => call("link", req),
  };
}
