import { LocalDiskStorage } from "./local";
import type { StoragePort } from "./port";
import { S3Storage } from "./s3";
import { createVercelBlobStorage } from "./vercel-blob";

export { handleLocalStorageRequest, type LocalDiskOptions, LocalDiskStorage } from "./local";
export { MemoryStorage } from "./memory";
export * from "./port";
export { type S3Options, S3Storage } from "./s3";
export { createVercelBlobStorage, type VercelBlobOptions } from "./vercel-blob";

export type StorageConfig =
  | { driver: "local"; root: string; publicUrl: string; secret: string; maxPutBytes?: number }
  | {
      driver: "s3";
      bucket: string;
      endpoint?: string;
      region?: string;
      accessKeyId: string;
      secretAccessKey: string;
      forcePathStyle?: boolean;
    }
  | { driver: "vercel-blob"; token: string };

export function createStorage(config: StorageConfig): StoragePort {
  switch (config.driver) {
    case "local":
      return new LocalDiskStorage(config);
    case "s3":
      return new S3Storage(config);
    case "vercel-blob":
      return createVercelBlobStorage(config);
  }
}
