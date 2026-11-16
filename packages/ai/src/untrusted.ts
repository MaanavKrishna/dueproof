/**
 * Prompt-injection hardening (04 §7, 05 §9): document text is data. It goes
 * into one clearly delimited block in the user turn; the instructions live in
 * the system prompt and say the block is data. Anything in the text that
 * looks like our delimiters is neutralised so the text cannot close the block.
 */

export const UNTRUSTED_OPEN = "<untrusted_document>";
export const UNTRUSTED_CLOSE = "</untrusted_document>";

const DELIMITER_LIKE =
  /<\s*(\/?)\s*(untrusted_document|page|instructions|system|findings|question|passages|template|notice|data)\b/gi;
// Control characters other than tab and newline (and CR, normalised below).
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g;

/** Make text safe to place inside the untrusted block. Only touches delimiter look-alikes and control characters. */
export function neutralise(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL, "")
    .replace(DELIMITER_LIKE, (_m, slash: string, name: string) => `‹${slash}${name}`);
}

export interface UntrustedPage {
  page: number;
  text: string;
}

/** The untrusted block: one `<page number="n">` per page, text neutralised. */
export function untrustedBlock(pages: readonly UntrustedPage[]): string {
  const body = pages
    .map((p) => `<page number="${Math.trunc(p.page)}">\n${neutralise(p.text)}\n</page>`)
    .join("\n");
  return `${UNTRUSTED_OPEN}\n${body}\n${UNTRUSTED_CLOSE}`;
}

/** Read the pages back out of a user turn (used by the fake provider). */
export function parseUntrustedBlock(user: string): UntrustedPage[] {
  const start = user.indexOf(UNTRUSTED_OPEN);
  const end = user.lastIndexOf(UNTRUSTED_CLOSE);
  if (start < 0 || end < start) return [];
  const inner = user.slice(start + UNTRUSTED_OPEN.length, end);
  const pages: UntrustedPage[] = [];
  const re = /<page number="(\d+)">\n([\s\S]*?)\n<\/page>/g;
  for (let m = re.exec(inner); m; m = re.exec(inner)) {
    pages.push({ page: Number(m[1]), text: m[2] ?? "" });
  }
  return pages;
}

/** A labelled data block for non-document inputs (findings, questions, templates). Also neutralised. */
export function dataBlock(name: string, content: string): string {
  const tag = name.replace(/[^a-z_]/gi, "");
  return `<${tag}>\n${neutralise(content)}\n</${tag}>`;
}
