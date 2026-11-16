/**
 * Local-disk storage for self-hosted servers and the desktop app.
 *
 * Signed URLs point at an app route (default `/api/storage/local`) with an
 * HMAC token: base64url(JSON payload) "." base64url(HMAC-SHA256(secret,
 * payload part)). The payload names the key (and so the organisation), the
 * method, the expiry, and for PUTs the content type and size cap. The route
 * hands the request to `handleLocalStorageRequest()`.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import {
  assertKey,
  clampExpiry,
  type ObjectInfo,
  type PutOptions,
  type PutSignOptions,
  type SignedUrl,
  type SignOptions,
  type StoragePort,
} from "./port";

export interface LocalDiskOptions {
  /** Directory that holds the objects. */
  root: string;
  /** Absolute URL of the route that serves signed requests, e.g. "http://localhost:3000/api/storage/local". */
  publicUrl: string;
  /** Secret for URL tokens (≥ 32 bytes). */
  secret: string;
  /** Hard cap for any signed PUT, in bytes. Default 50 MB (05 §3a). */
  maxPutBytes?: number;
  now?: () => number;
}

interface TokenPayload {
  k: string;
  m: "GET" | "PUT";
  e: number;
  ct?: string;
  max?: number;
}

const b64u = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");

export class LocalDiskStorage implements StoragePort {
  readonly kind = "local" as const;
  readonly #root: string;
  readonly #publicUrl: string;
  readonly #secret: string;
  readonly #maxPut: number;
  readonly #now: () => number;

  constructor(options: LocalDiskOptions) {
    if (options.secret.length < 32)
      throw new Error("local storage secret must be at least 32 characters");
    this.#root = resolve(options.root);
    this.#publicUrl = options.publicUrl;
    this.#secret = options.secret;
    this.#maxPut = options.maxPutBytes ?? 50 * 1024 * 1024;
    this.#now = options.now ?? Date.now;
  }

  #path(key: string): string {
    assertKey(key);
    const p = resolve(this.#root, ...key.split("/"));
    if (!p.startsWith(this.#root + sep)) throw new Error("key escapes the storage root");
    return p;
  }

  async put(key: string, body: Uint8Array, options: PutOptions = {}): Promise<void> {
    const path = this.#path(key);
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.${this.#now()}.tmp`;
    await writeFile(tmp, body);
    await rename(tmp, path);
    if (options.contentType)
      await writeFile(`${path}.meta`, JSON.stringify({ contentType: options.contentType }));
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.#path(key)));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async head(key: string): Promise<ObjectInfo | null> {
    const path = this.#path(key);
    try {
      const s = await stat(path);
      let contentType: string | undefined;
      try {
        contentType = (
          JSON.parse(await readFile(`${path}.meta`, "utf8")) as { contentType?: string }
        ).contentType;
      } catch {
        contentType = undefined;
      }
      return { size: s.size, contentType };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async delete(key: string): Promise<void> {
    const path = this.#path(key);
    await rm(path, { force: true });
    await rm(`${path}.meta`, { force: true });
  }

  #sign(payload: TokenPayload): string {
    const body = b64u(JSON.stringify(payload));
    const mac = createHmac("sha256", this.#secret).update(body).digest();
    return `${body}.${b64u(mac)}`;
  }

  /** Returns the payload if the token is genuine and unexpired, else null. */
  verifyToken(token: string): TokenPayload | null {
    const [body, mac] = token.split(".");
    if (!body || !mac) return null;
    const expected = createHmac("sha256", this.#secret).update(body).digest();
    const given = Buffer.from(mac, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    let payload: TokenPayload;
    try {
      payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
    } catch {
      return null;
    }
    if (typeof payload.e !== "number" || payload.e * 1000 < this.#now()) return null;
    try {
      assertKey(payload.k);
    } catch {
      return null;
    }
    return payload;
  }

  #url(payload: TokenPayload): SignedUrl {
    const url = new URL(this.#publicUrl);
    url.searchParams.set("token", this.#sign(payload));
    return {
      url: url.toString(),
      method: payload.m,
      headers: payload.ct ? { "content-type": payload.ct } : {},
      expiresAt: new Date(payload.e * 1000),
    };
  }

  async putSignedUrl(key: string, options: PutSignOptions = {}): Promise<SignedUrl> {
    assertKey(key);
    const e = Math.floor(this.#now() / 1000) + clampExpiry(options.expiresIn);
    const max = Math.min(options.maxBytes ?? this.#maxPut, this.#maxPut);
    return this.#url({
      k: key,
      m: "PUT",
      e,
      max,
      ...(options.contentType ? { ct: options.contentType } : {}),
    });
  }

  async getSignedUrl(key: string, options: SignOptions = {}): Promise<SignedUrl> {
    assertKey(key);
    const e = Math.floor(this.#now() / 1000) + clampExpiry(options.expiresIn);
    return this.#url({ k: key, m: "GET", e });
  }

  /** Read the object a signed GET URL points at (for in-process callers such as the fake engine). */
  async readSignedUrl(url: string): Promise<Uint8Array | null> {
    const token = new URL(url).searchParams.get("token");
    const payload = token ? this.verifyToken(token) : null;
    if (payload?.m !== "GET") return null;
    return this.get(payload.k);
  }

  /** Write the body for a signed PUT URL (in-process callers). */
  async writeSignedUrl(url: string, body: Uint8Array, contentType?: string): Promise<boolean> {
    const token = new URL(url).searchParams.get("token");
    const payload = token ? this.verifyToken(token) : null;
    if (payload?.m !== "PUT") return false;
    if (payload.max !== undefined && body.byteLength > payload.max) return false;
    await this.put(payload.k, body, contentType ? { contentType } : {});
    return true;
  }
}

/**
 * The app route for local signed URLs: `GET|PUT /api/storage/local?token=…`.
 * No session is needed: the token is the authorisation, bound to one key,
 * one method and a short expiry.
 */
export async function handleLocalStorageRequest(
  storage: LocalDiskStorage,
  request: Request,
): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token");
  const payload = token ? storage.verifyToken(token) : null;
  if (!payload) return new Response("invalid or expired link", { status: 403 });
  if (request.method !== payload.m) return new Response("method not allowed", { status: 405 });

  const headers = {
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  };
  if (payload.m === "GET") {
    const body = await storage.get(payload.k);
    if (!body) return new Response("not found", { status: 404, headers });
    const info = await storage.head(payload.k);
    return new Response(body as unknown as BodyInit, {
      status: 200,
      headers: { ...headers, "content-type": info?.contentType ?? "application/octet-stream" },
    });
  }

  const contentType = request.headers.get("content-type") ?? undefined;
  if (payload.ct && contentType?.split(";")[0]?.trim() !== payload.ct) {
    return new Response("content-type does not match the signed URL", { status: 400, headers });
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (payload.max !== undefined && declared > payload.max) {
    return new Response("too large", { status: 413, headers });
  }
  const body = await readCapped(request, payload.max ?? Number.MAX_SAFE_INTEGER);
  if (!body) return new Response("too large", { status: 413, headers });
  await storage.put(payload.k, body, contentType ? { contentType } : {});
  return new Response(null, { status: 200, headers });
}

async function readCapped(request: Request, max: number): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
