import { dim, num, str, type Token, type TokenGroup } from "../format";

const rem = (px: number) => dim(px / 16, "rem");

export const font: TokenGroup = {
  family: {
    /** System font on Apple devices (SF Pro), Inter elsewhere. Self-hosted; no font CDN. */
    sans: str(
      '-apple-system, BlinkMacSystemFont, "Inter", "Inter Variable", "Segoe UI", system-ui, "Noto Sans", sans-serif',
      "fontFamily",
    ),
    mono: str(
      '"SF Mono", ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace',
      "fontFamily",
    ),
    /** Indic notice text; per-script Noto faces are loaded on demand by the app. */
    indic: str(
      '"Noto Sans Devanagari", "Noto Sans Bengali", "Noto Sans Tamil", "Noto Sans Telugu", "Noto Sans Kannada", "Noto Sans Malayalam", "Noto Sans Gujarati", "Noto Sans Gurmukhi", "Noto Sans Oriya", "Noto Nastaliq Urdu", "Noto Sans", sans-serif',
      "fontFamily",
    ),
  },
  weight: {
    regular: num(400, "fontWeight"),
    book: num(450, "fontWeight"),
    medium: num(500, "fontWeight"),
    semibold: num(600, "fontWeight"),
    strong: num(650, "fontWeight"),
    bold: num(700, "fontWeight"),
  },
  lineHeight: { indic: num(1.75), tight: num(1) },
};

interface TypeStyle {
  size: number;
  line: number;
  weight: number;
  tracking?: string;
  family?: "sans" | "mono";
}

/** Type styles (02 §5). Sizes in px here, emitted as rem so OS text size scales them. */
export const typeStyles: Record<string, TypeStyle> = {
  display: { size: 56, line: 56, weight: 700, tracking: "-0.025em" },
  displayLarge: { size: 72, line: 72, weight: 700, tracking: "-0.03em" },
  largeTitle: { size: 30, line: 36, weight: 700, tracking: "-0.015em" },
  title1: { size: 24, line: 30, weight: 700, tracking: "-0.01em" },
  title2: { size: 20, line: 26, weight: 650, tracking: "-0.005em" },
  title3: { size: 17, line: 22, weight: 600 },
  headline: { size: 14, line: 20, weight: 600 },
  body: { size: 14, line: 21, weight: 400 },
  reading: { size: 15, line: 24, weight: 400 },
  callout: { size: 13, line: 18, weight: 400 },
  subhead: { size: 13, line: 18, weight: 500 },
  footnote: { size: 12, line: 16, weight: 400 },
  caption: { size: 11, line: 14, weight: 500 },
  overline: { size: 11, line: 14, weight: 600, tracking: "0.06em" },
  mono: { size: 12.5, line: 18, weight: 450, family: "mono" },
};

function typeGroup(): TokenGroup {
  const out: TokenGroup = {};
  for (const [name, s] of Object.entries(typeStyles)) {
    const fam = s.family === "mono" ? "{font.family.mono}" : "{font.family.sans}";
    out[name] = {
      size: rem(s.size),
      line: rem(s.line),
      weight: num(s.weight, "fontWeight"),
      tracking: str(s.tracking ?? "0em", "dimension"),
      font: {
        $type: "typography",
        $value: `${s.weight} ${s.size / 16}rem/${s.line / 16}rem ${fam}`,
      } satisfies Token,
    };
  }
  return out;
}

export const text: TokenGroup = typeGroup();

/** 4-point spacing scale (02 §6). Token names are the pixel values. */
export const space: TokenGroup = Object.fromEntries(
  [0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96].map((n) => [String(n), dim(n)]),
);

export const radius: TokenGroup = {
  xs: dim(4),
  sm: dim(6),
  md: dim(8),
  lg: dim(12),
  xl: dim(16),
  xxl: dim(22),
  pill: dim(9999),
};

export const border: TokenGroup = {
  hairline: dim(1),
  thick: dim(2),
};

/** Soft layered shadows. Colours come from shadowColor, so they follow the theme. */
export const shadow: TokenGroup = {
  "1": str(
    "0 0 0 1px {shadowColor.ring}, 0 1px 2px {shadowColor.key}, 0 1px 3px {shadowColor.ambient}",
    "shadow",
  ),
  "2": str(
    "0 0 0 1px {shadowColor.ring}, 0 2px 4px {shadowColor.key}, 0 6px 16px {shadowColor.ambient}",
    "shadow",
  ),
  "3": str(
    "0 0 0 1px {shadowColor.ring}, 0 8px 16px {shadowColor.key}, 0 20px 48px {shadowColor.ambient}",
    "shadow",
  ),
  /** The document page sitting on the canvas. */
  page: str(
    "0 0 0 1px {shadowColor.ring}, 0 1px 2px {shadowColor.key}, 0 4px 24px {shadowColor.ambient}",
    "shadow",
  ),
};

export const blur: TokenGroup = {
  material: str("saturate(180%) blur(20px)"),
};

export const focus: TokenGroup = {
  width: dim(2),
  offset: dim(2),
};

export const duration: TokenGroup = {
  instant: str("80ms", "duration"),
  fade: str("140ms", "duration"),
  snap: str("180ms", "duration"),
  standard: str("280ms", "duration"),
  sheet: str("380ms", "duration"),
  emphasis: str("500ms", "duration"),
};

export const ease: TokenGroup = {
  standard: str("cubic-bezier(0.2, 0, 0, 1)", "cubicBezier"),
  out: str("cubic-bezier(0, 0, 0.2, 1)", "cubicBezier"),
  in: str("cubic-bezier(0.4, 0, 1, 1)", "cubicBezier"),
  /** A gentle overshoot, for CSS-only transitions that stand in for springs. */
  spring: str("cubic-bezier(0.34, 1.36, 0.64, 1)", "cubicBezier"),
};

export const z: TokenGroup = {
  base: num(0),
  raised: num(1),
  sticky: num(100),
  sidebar: num(200),
  dropdown: num(1000),
  banner: num(1100),
  overlay: num(1300),
  modal: num(1400),
  popover: num(1500),
  toast: num(1600),
  tooltip: num(1700),
};

export const layout: TokenGroup = {
  sidebar: dim(248),
  sidebarCollapsed: dim(64),
  toolbar: dim(52),
  content: dim(880),
  inspector: dim(440),
  measure: dim(72, "ch"),
  dialogSm: dim(400),
  dialogMd: dim(560),
  dialogLg: dim(760),
  sheet: dim(440),
};

/** Breakpoints are for TS (media queries cannot read CSS variables). */
export const breakpoints = {
  tablet: 640,
  laptop: 1024,
  desktop: 1440,
  inspectorInline: 1280,
} as const;

/** Density-dependent sizes (02 §6). `comfortable` is the default. */
export const density: Record<"comfortable" | "compact", TokenGroup> = {
  comfortable: {
    row: dim(48),
    control: { sm: dim(28), md: dim(36), lg: dim(44) },
    padX: { sm: dim(10), md: dim(14), lg: dim(18) },
    gap: dim(12),
    cellPadY: dim(12),
    cellPadX: dim(16),
  },
  compact: {
    row: dim(36),
    control: { sm: dim(24), md: dim(30), lg: dim(38) },
    padX: { sm: dim(8), md: dim(10), lg: dim(14) },
    gap: dim(8),
    cellPadY: dim(6),
    cellPadX: dim(12),
  },
};

/** Minimum hit target: 44px on coarse pointers whatever the density. */
export const target = { fine: 24, coarse: 44 } as const;

/** Motion springs (02 §7). Used by `@dueproof/ui/motion`. */
export const motion = {
  snap: { type: "spring", visualDuration: 0.18, bounce: 0 },
  standard: { type: "spring", visualDuration: 0.28, bounce: 0.08 },
  sheet: { type: "spring", visualDuration: 0.38, bounce: 0.12 },
  emphasis: { type: "spring", visualDuration: 0.5, bounce: 0.18 },
  fade: { type: "tween", duration: 0.14, ease: "easeOut" },
} as const;
