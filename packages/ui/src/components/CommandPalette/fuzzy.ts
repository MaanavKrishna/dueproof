/**
 * A small fuzzy matcher for the command palette: the query's characters must
 * appear in order. Matches at word starts and runs of consecutive characters
 * score higher, so "nd" ranks "Notice detail" above "Open deadlines".
 */
export interface FuzzyMatch {
  score: number;
  /** Indexes of matched characters in the text, for highlighting. */
  indexes: number[];
}

function isWordStart(text: string, i: number): boolean {
  if (i === 0) return true;
  const prev = text[i - 1] ?? "";
  const ch = text[i] ?? "";
  return /[\s\-_/·:.(]/.test(prev) || (prev === prev.toLowerCase() && ch !== ch.toLowerCase());
}

export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 0, indexes: [] };
  const t = text.toLowerCase();

  // A plain substring is the strongest signal.
  const at = t.indexOf(q);
  if (at >= 0) {
    const indexes = Array.from({ length: q.length }, (_, i) => at + i);
    return { score: 1000 - at + (isWordStart(text, at) ? 200 : 0) + q.length * 10, indexes };
  }

  const indexes: number[] = [];
  let score = 0;
  let ti = 0;
  let prev = -2;
  for (const ch of q) {
    if (ch === " ") continue;
    let found = -1;
    // Prefer the next word start that matches; otherwise the next occurrence.
    for (let j = ti; j < t.length; j++) {
      if (t[j] === ch && isWordStart(text, j)) {
        found = j;
        break;
      }
    }
    const next = t.indexOf(ch, ti);
    if (found < 0 || (next >= 0 && next === prev + 1)) found = next;
    if (found < 0) return null;
    score += 10;
    if (found === prev + 1) score += 15;
    if (isWordStart(text, found)) score += 20;
    score -= Math.min(found - ti, 10);
    indexes.push(found);
    prev = found;
    ti = found + 1;
  }
  return { score, indexes };
}

/** Best match across a label and its keywords (keywords match but aren't highlighted). */
export function fuzzyScore(
  query: string,
  label: string,
  keywords: readonly string[] = [],
): FuzzyMatch | null {
  const main = fuzzyMatch(query, label);
  let best = main;
  for (const k of keywords) {
    const m = fuzzyMatch(query, k);
    if (m && (!best || m.score - 50 > best.score)) best = { score: m.score - 50, indexes: [] };
  }
  return best;
}
