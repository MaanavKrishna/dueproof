/** In-memory storage for tests. Signed URLs use a `memory://` scheme and can be read back in-process. */
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

export class MemoryStorage implements StoragePort {
  readonly kind = "memory" as const;
  readonly objects = new Map<string, { body: Uint8Array; contentType?: string | undefined }>();

  async put(key: string, body: Uint8Array, options: PutOptions = {}): Promise<void> {
    assertKey(key);
    this.objects.set(key, { body: new Uint8Array(body), contentType: options.contentType });
  }
  async get(key: string): Promise<Uint8Array | null> {
    assertKey(key);
    return this.objects.get(key)?.body ?? null;
  }
  async head(key: string): Promise<ObjectInfo | null> {
    const o = this.objects.get(key);
    return o ? { size: o.body.byteLength, contentType: o.contentType } : null;
  }
  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
  #url(key: string, method: "GET" | "PUT", expiresIn?: number): SignedUrl {
    assertKey(key);
    const s = clampExpiry(expiresIn);
    return {
      url: `memory://storage/${method}/${encodeURIComponent(key)}`,
      method,
      headers: {},
      expiresAt: new Date(Date.now() + s * 1000),
    };
  }
  async putSignedUrl(key: string, options: PutSignOptions = {}): Promise<SignedUrl> {
    return this.#url(key, "PUT", options.expiresIn);
  }
  async getSignedUrl(key: string, options: SignOptions = {}): Promise<SignedUrl> {
    return this.#url(key, "GET", options.expiresIn);
  }
  async readSignedUrl(url: string): Promise<Uint8Array | null> {
    const m = url.match(/^memory:\/\/storage\/GET\/(.+)$/);
    return m?.[1] ? this.get(decodeURIComponent(m[1])) : null;
  }
  async writeSignedUrl(url: string, body: Uint8Array, contentType?: string): Promise<boolean> {
    const m = url.match(/^memory:\/\/storage\/PUT\/(.+)$/);
    if (!m?.[1]) return false;
    await this.put(decodeURIComponent(m[1]), body, contentType ? { contentType } : {});
    return true;
  }
}
