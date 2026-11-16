/**
 * The eval's linker. First the TypeScript port's exact token match
 * (packages/engine-client linkQuotes); for quotes it can't place, a
 * spacing-insensitive match over the page's words, graded `strong`.
 *
 * Why: the engine's page `text` and its `words` can split a word differently
 * (e.g. "മെട്രോറെയിൽ" in the text, "മെട്രോ" + "റെയിൽ" as words). A model
 * quotes the text; the exact token match then misses, while the engine's own
 * fuzzy linker (which production calls) finds it. This keeps the eval from
 * blaming the model for a tokenisation difference. Never used outside the eval.
 */
import type { engine } from "../../packages/contracts/src/index";
import { linkQuotes } from "../../packages/engine-client/src/index";

type Rect = [number, number, number, number];

const squash = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, "");

function looseMatch(page: engine.PageText, quote: string): Rect[] | null {
  const q = squash(quote);
  if (q.length < 8) return null;
  let joined = "";
  const owner: number[] = [];
  page.words.forEach((w, i) => {
    const s = squash(w.text);
    joined += s;
    for (let k = 0; k < s.length; k++) owner.push(i);
  });
  const at = joined.indexOf(q);
  if (at < 0) return null;
  const first = owner[at] as number;
  const last = owner[at + q.length - 1] as number;
  const byLine = new Map<number, Rect>();
  for (const w of page.words.slice(first, last + 1)) {
    const r = byLine.get(w.line);
    byLine.set(
      w.line,
      r
        ? [Math.min(r[0], w.rect[0]), Math.min(r[1], w.rect[1]), Math.max(r[2], w.rect[2]), Math.max(r[3], w.rect[3])]
        : [w.rect[0], w.rect[1], w.rect[2], w.rect[3]],
    );
  }
  return [...byLine.values()];
}

export function evalLink(
  pages: readonly engine.PageText[],
  quotes: { id: string; text: string; pageHint?: number }[],
): engine.LinkResponse {
  const exact = linkQuotes({ pages: [...pages], quotes });
  return {
    matches: exact.matches.map((m) => {
      if (m.grade !== "unlocated") return m;
      const q = quotes.find((x) => x.id === m.id);
      if (!q) return m;
      const ordered = [...pages].sort((a, b) => Number(b.page === q.pageHint) - Number(a.page === q.pageHint));
      for (const page of ordered) {
        const rects = looseMatch(page, q.text);
        if (rects) return { id: m.id, page: page.page, rects, score: 0.95, grade: "strong" as const };
      }
      return m;
    }),
  };
}
