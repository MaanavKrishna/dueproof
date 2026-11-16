/**
 * UUIDv7 (RFC 9562): 48-bit Unix millisecond timestamp, version 7, 12 bits
 * of sub-millisecond sequence, variant 10, 62 random bits. Sortable by time
 * and not guessable (05 §2). Ids made in the same millisecond by one process
 * stay in order: the 12-bit counter (rand_a) increments, with a random start.
 */
let lastMs = -1;
let seq = 0;

export function uuidv7(at?: number): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  if (at !== undefined) return format(bytes, at, (((bytes[6] ?? 0) & 0x0f) << 8) | (bytes[7] ?? 0));

  let ms = Date.now();
  if (ms <= lastMs) {
    ms = lastMs;
    seq += 1;
    if (seq > 0xfff) {
      // Counter overflow: borrow the next millisecond rather than repeat.
      ms = lastMs + 1;
      seq = (bytes[6] ?? 0) & 0x07;
    }
  } else {
    // Random start in the lower half so the counter has room to grow.
    seq = (((bytes[6] ?? 0) & 0x07) << 8) | (bytes[7] ?? 0);
  }
  lastMs = ms;
  return format(bytes, ms, seq);
}

function format(bytes: Uint8Array, ms: number, seq: number): string {
  bytes[0] = Math.floor(ms / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(ms / 2 ** 32) & 0xff;
  bytes[2] = (ms >>> 24) & 0xff;
  bytes[3] = (ms >>> 16) & 0xff;
  bytes[4] = (ms >>> 8) & 0xff;
  bytes[5] = ms & 0xff;
  bytes[6] = 0x70 | ((seq >>> 8) & 0x0f);
  bytes[7] = seq & 0xff;
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUIDV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isUuidv7(value: string): boolean {
  return UUIDV7.test(value);
}

/** The creation time encoded in a UUIDv7. */
export function uuidv7Time(value: string): Date {
  const hex = value.replace(/-/g, "").slice(0, 12);
  return new Date(Number.parseInt(hex, 16));
}
