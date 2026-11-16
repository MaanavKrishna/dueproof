import { BRANDS, MODES, type Mode, resolveColor } from "./build";
import { contrast } from "./color-math";
import type { BrandName } from "./source/color";

/** AA thresholds: 4.5 for text, 3 for large text, UI component boundaries and glyphs. */
export const AA_TEXT = 4.5;
export const AA_UI = 3;

export interface Pair {
  fg: string;
  bg: string;
  min: number;
  /** Colour under a translucent bg (defaults to bg.canvas). */
  over?: string;
  note?: string;
}

const textBgs = ["bg.canvas", "bg.surface", "bg.elevated"];
const tones = ["danger", "warning", "success", "info"] as const;
const due = ["overdue", "today", "week", "later", "done"] as const;

/** Every text/background pair the components actually use. */
export const pairs: Pair[] = [
  ...["fg.primary", "fg.secondary", "fg.tertiary"].flatMap((fg) =>
    textBgs.map((bg) => ({ fg, bg, min: AA_TEXT })),
  ),
  { fg: "fg.secondary", bg: "bg.sunken", min: AA_TEXT, note: "segmented control labels" },
  { fg: "fg.quaternary", bg: "bg.surface", min: AA_UI, note: "disabled text and glyphs" },
  { fg: "fg.page", bg: "bg.page", min: AA_TEXT },
  { fg: "fg.page", bg: "proof.highlight", min: AA_TEXT, note: "text under a proof highlight" },
  { fg: "fg.inverse", bg: "bg.inverse", min: AA_TEXT, note: "tooltips" },
  { fg: "fg.primary", bg: "accent.subtle", min: AA_TEXT, note: "selected rows" },
  { fg: "fg.primary", bg: "material.regular", min: AA_TEXT },
  { fg: "fg.secondary", bg: "material.chrome", min: AA_TEXT, note: "sidebar labels" },
  ...["accent.solid", "accent.hover", "accent.pressed"].map((bg) => ({
    fg: "accent.onSolid",
    bg,
    min: AA_TEXT,
  })),
  ...["bg.canvas", "bg.surface"].map((bg) => ({ fg: "accent.text", bg, min: AA_TEXT })),
  { fg: "accent.subtleFg", bg: "accent.subtle", min: AA_TEXT },
  ...["bg.canvas", "bg.surface"].map((bg) => ({ fg: "focus.ring", bg, min: AA_UI })),
  ...["bg.canvas", "bg.surface"].map((bg) => ({ fg: "separator.control", bg, min: AA_UI })),
  ...["accent.solid"].map((fg) => ({
    fg,
    bg: "bg.surface",
    min: AA_UI,
    note: "checked checkbox / switch",
  })),
  { fg: "proof.fg", bg: "proof.bg", min: AA_TEXT },
  { fg: "proof.fg", bg: "bg.surface", min: AA_TEXT },
  { fg: "proof.stroke", bg: "bg.page", min: AA_UI, note: "highlight outline on the page" },
  ...due.flatMap((d) => [
    { fg: `due.${d}.fg`, bg: `due.${d}.bg`, min: AA_TEXT },
    { fg: `due.${d}.fg`, bg: "bg.surface", min: AA_TEXT },
  ]),
  ...tones.flatMap((t) => [
    { fg: `feedback.${t}.fg`, bg: `feedback.${t}.bg`, min: AA_TEXT },
    { fg: `feedback.${t}.fg`, bg: "bg.surface", min: AA_TEXT },
    { fg: "fg.primary", bg: `feedback.${t}.bg`, min: AA_TEXT, note: "banner body text" },
    { fg: `feedback.${t}.onSolid`, bg: `feedback.${t}.solid`, min: AA_TEXT },
    { fg: `feedback.${t}.onSolid`, bg: `feedback.${t}.solidHover`, min: AA_TEXT },
  ]),
];

export interface Result extends Pair {
  brand: BrandName;
  mode: Mode;
  ratio: number;
  pass: boolean;
}

export function checkContrast(): Result[] {
  const out: Result[] = [];
  for (const brand of BRANDS) {
    for (const mode of MODES) {
      for (const p of pairs) {
        const fg = resolveColor(p.fg, brand, mode);
        const bg = resolveColor(p.bg, brand, mode);
        const base = resolveColor(p.over ?? "bg.canvas", brand, mode);
        const ratio = contrast(fg, bg, base);
        out.push({ ...p, brand, mode, ratio, pass: ratio >= p.min });
      }
    }
  }
  return out;
}
