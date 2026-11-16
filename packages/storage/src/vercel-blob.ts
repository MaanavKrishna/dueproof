/**
 * Vercel Blob (private) adapter: a stub for v0.1. Hosted uses R2 through
 * S3Storage (03 §1); this exists so the port has a slot for it. Building it
 * needs `@vercel/blob` and private-store signed reads.
 */
import type { StoragePort } from "./port";

export interface VercelBlobOptions {
  token: string;
}

export function createVercelBlobStorage(_options: VercelBlobOptions): StoragePort {
  const no = async (): Promise<never> => {
    throw new Error(
      "Vercel Blob storage is not implemented yet; use STORAGE_DRIVER=s3 (R2) or local",
    );
  };
  return {
    kind: "vercel-blob",
    put: no,
    get: no,
    head: no,
    delete: no,
    putSignedUrl: no,
    getSignedUrl: no,
  };
}
