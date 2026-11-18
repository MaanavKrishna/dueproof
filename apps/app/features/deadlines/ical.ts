/**
 * The calendar feed (05 §4: "signed per-user token in the URL; can be
 * revoked; holds titles and dates only").
 *
 * A token is `base64url(payload).base64url(hmac)`, payload
 * `v1|orgId|userId|scope|issuedAtMs`, signed with a key derived from
 * AUTH_SECRET. Revoking writes a `calendar.feed_revoked` audit row; tokens
 * issued before the latest revocation are refused. A token also expires a
 * year after it was issued (I2): subscribe again for a new one, which is
 * also how a link is rotated. Pure apart from the key.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type FeedScope = "me" | "org";

export interface FeedToken {
  orgId: string;
  userId: string;
  scope: FeedScope;
  /** Milliseconds since the epoch. */
  issuedAt: number;
}

function key(secret: string): Buffer {
  return createHmac("sha256", secret).update("dueproof:ical:v1").digest();
}

export function signFeedToken(secret: string, t: FeedToken): string {
  const payload = Buffer.from(
    ["v1", t.orgId, t.userId, t.scope, String(Math.floor(t.issuedAt))].join("|"),
  ).toString("base64url");
  const mac = createHmac("sha256", key(secret)).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

/** A feed link works for a year (I2). */
export const FEED_TOKEN_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
/** Clock skew allowed for a token issued "in the future". */
const FEED_TOKEN_SKEW_MS = 5 * 60 * 1000;

export function verifyFeedToken(
  secret: string,
  token: string,
  now: number = Date.now(),
): FeedToken | null {
  const [payload, mac, extra] = token.split(".");
  if (!payload || !mac || extra !== undefined) return null;
  const want = createHmac("sha256", key(secret)).update(payload).digest();
  let got: Buffer;
  try {
    got = Buffer.from(mac, "base64url");
  } catch {
    return null;
  }
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const parts = Buffer.from(payload, "base64url").toString("utf8").split("|");
  if (parts.length !== 5 || parts[0] !== "v1") return null;
  const [, orgId, userId, scope, issued] = parts as [string, string, string, string, string];
  if (scope !== "me" && scope !== "org") return null;
  const issuedAt = Number(issued);
  if (!orgId || !userId || !Number.isInteger(issuedAt)) return null;
  if (issuedAt > now + FEED_TOKEN_SKEW_MS || now - issuedAt > FEED_TOKEN_MAX_AGE_MS) return null;
  return { orgId, userId, scope, issuedAt };
}

export interface FeedEvent {
  id: string;
  title: string;
  /** ISO date: an all-day event. */
  date: string;
  description?: string;
  url?: string;
}

/** RFC 5545 text escaping. Any line break (CRLF, LF or a lone CR) becomes \\n; other control characters are dropped (I2). */
export function esc(s: string): string {
  return (
    s
      .replace(/\\/g, "\\\\")
      .replace(/\r\n|\r|\n/g, "\\n")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: removing control characters is the point
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
      .replace(/([,;])/g, "\\$1")
  );
}

/** Fold lines longer than 75 octets (RFC 5545 §3.1). */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, "utf8") > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const ymd = (iso: string) => iso.replace(/-/g, "");

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function renderIcs(name: string, events: FeedEvent[], now: Date = new Date()): string {
  const stamp = `${now.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Dueproof//Deadlines//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(name)}`,
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@dueproof`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(e.date)}`,
      `DTEND;VALUE=DATE:${ymd(nextDay(e.date))}`,
      `SUMMARY:${esc(e.title)}`,
      "TRANSP:TRANSPARENT",
    );
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
