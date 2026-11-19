/**
 * S3-compatible storage: Cloudflare R2 on hosted (03 §1), MinIO in local dev.
 * Signed URLs are SigV4 presigned, at most five minutes.
 *
 * Upload PUTs sign Content-Type and Content-Length (`X-Amz-SignedHeaders`
 * lists both), so the store refuses a body of any other size or type: the
 * browser sets Content-Length from the file it sends, and a different
 * length breaks the signature. R2 has no presigned POST (no
 * content-length-range policy), so a signed header is how the size is
 * bound there. The upload is then copied to a key no URL was signed for
 * (`sealUpload`), so a second PUT on the same URL changes nothing checked.
 */
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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

export interface S3Options {
  bucket: string;
  /** R2: https://<account>.r2.cloudflarestorage.com */
  endpoint?: string;
  /** R2 uses "auto". */
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** MinIO needs path-style URLs. */
  forcePathStyle?: boolean;
  now?: () => number;
}

function isNotFound(e: unknown): boolean {
  const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    err.name === "NoSuchKey" || err.name === "NotFound" || err.$metadata?.httpStatusCode === 404
  );
}

export class S3Storage implements StoragePort {
  readonly kind = "s3" as const;
  readonly #client: S3Client;
  readonly #bucket: string;
  readonly #now: () => number;

  constructor(options: S3Options) {
    this.#bucket = options.bucket;
    this.#now = options.now ?? Date.now;
    this.#client = new S3Client({
      region: options.region ?? "auto",
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      forcePathStyle: options.forcePathStyle ?? false,
      credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
      // By default the SDK puts a CRC32 into every presigned PUT, computed over
      // an empty body (`x-amz-checksum-crc32=AAAAAA==`), so the store refuses the
      // browser's upload of the real file. Checksums only where an API needs one.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }

  async put(key: string, body: Uint8Array, options: PutOptions = {}): Promise<void> {
    assertKey(key);
    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.#bucket,
        Key: key,
        Body: body,
        ...(options.contentType ? { ContentType: options.contentType } : {}),
      }),
    );
  }

  async get(key: string): Promise<Uint8Array | null> {
    assertKey(key);
    try {
      const res = await this.#client.send(new GetObjectCommand({ Bucket: this.#bucket, Key: key }));
      return res.Body ? await res.Body.transformToByteArray() : new Uint8Array();
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async head(key: string): Promise<ObjectInfo | null> {
    assertKey(key);
    try {
      const res = await this.#client.send(
        new HeadObjectCommand({ Bucket: this.#bucket, Key: key }),
      );
      return { size: res.ContentLength ?? 0, contentType: res.ContentType };
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async getStream(key: string): Promise<AsyncIterable<Uint8Array> | null> {
    assertKey(key);
    try {
      const res = await this.#client.send(new GetObjectCommand({ Bucket: this.#bucket, Key: key }));
      if (!res.Body) return (async function* () {})();
      return res.Body as unknown as AsyncIterable<Uint8Array>;
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async copy(from: string, to: string): Promise<void> {
    assertKey(from);
    assertKey(to);
    // Keys are limited to [A-Za-z0-9._=-] segments (assertKey), so the source needs no escaping.
    await this.#client.send(
      new CopyObjectCommand({
        Bucket: this.#bucket,
        Key: to,
        CopySource: `${this.#bucket}/${from}`,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    assertKey(key);
    await this.#client.send(new DeleteObjectCommand({ Bucket: this.#bucket, Key: key }));
  }

  async putSignedUrl(key: string, options: PutSignOptions = {}): Promise<SignedUrl> {
    assertKey(key);
    const expiresIn = clampExpiry(options.expiresIn);
    const command = new PutObjectCommand({
      Bucket: this.#bucket,
      Key: key,
      ...(options.contentType ? { ContentType: options.contentType } : {}),
      ...(options.size !== undefined ? { ContentLength: options.size } : {}),
    });
    const signable = new Set<string>();
    if (options.contentType) signable.add("content-type");
    if (options.size !== undefined) signable.add("content-length");
    const url = await getSignedUrl(this.#client, command, {
      expiresIn,
      signingDate: new Date(this.#now()),
      ...(signable.size ? { signableHeaders: signable } : {}),
    });
    return {
      url,
      method: "PUT",
      headers: options.contentType ? { "content-type": options.contentType } : {},
      expiresAt: new Date(this.#now() + expiresIn * 1000),
    };
  }

  async getSignedUrl(key: string, options: SignOptions = {}): Promise<SignedUrl> {
    assertKey(key);
    const expiresIn = clampExpiry(options.expiresIn);
    const url = await getSignedUrl(
      this.#client,
      new GetObjectCommand({ Bucket: this.#bucket, Key: key }),
      {
        expiresIn,
        signingDate: new Date(this.#now()),
      },
    );
    return { url, method: "GET", headers: {}, expiresAt: new Date(this.#now() + expiresIn * 1000) };
  }
}
