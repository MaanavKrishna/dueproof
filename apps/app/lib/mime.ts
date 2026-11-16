/**
 * File type by magic bytes, never by extension or the browser's claim
 * (05 §4). Allow-list: PDF, JPEG, PNG, TIFF.
 */
import type { engine } from "@dueproof/contracts";
import type { z } from "zod";

export type SupportedMime = z.infer<typeof engine.SupportedMime>;

export const ALLOWED_MIMES: readonly SupportedMime[] = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/tiff",
];

const starts = (b: Uint8Array, sig: number[], offset = 0) =>
  sig.every((x, i) => b[offset + i] === x);

export function sniffMime(bytes: Uint8Array): SupportedMime | null {
  // PDF: "%PDF-" within the first 1 KB (some writers put junk before it; the spec allows that).
  const head = bytes.subarray(0, 1024);
  for (let i = 0; i + 5 <= head.length; i++) {
    if (starts(head, [0x25, 0x50, 0x44, 0x46, 0x2d], i)) return "application/pdf";
  }
  if (starts(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts(bytes, [0x49, 0x49, 0x2a, 0x00]) || starts(bytes, [0x4d, 0x4d, 0x00, 0x2a]))
    return "image/tiff";
  return null;
}

export function isAllowedMime(mime: string): mime is SupportedMime {
  return (ALLOWED_MIMES as readonly string[]).includes(mime);
}
