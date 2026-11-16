/** Minimal colour maths for the contrast check: sRGB parsing, compositing, WCAG contrast. */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseColor(input: string): Rgba {
  const s = input.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
  if (hex?.[1]) {
    let h = hex[1];
    if (h.length === 3) h = [...h].map((c) => c + c).join("");
    const n = (i: number) => Number.parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  const rgb =
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[/,]\s*([\d.]+%?))?\s*\)$/i.exec(s);
  if (rgb) {
    const alpha = rgb[4];
    const a =
      alpha === undefined
        ? 1
        : alpha.endsWith("%")
          ? Number.parseFloat(alpha) / 100
          : Number(alpha);
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a };
  }
  throw new Error(`Unsupported colour: ${input}`);
}

/** Paint `top` over an opaque `bottom`. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a;
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
    a: 1,
  };
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(c: Rgba): number {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** WCAG 2 contrast ratio. Translucent colours are composited: fg over bg, bg over `base` (white by default). */
export function contrast(fg: string, bg: string, base = "#FFFFFF"): number {
  const solidBg = composite(parseColor(bg), parseColor(base));
  const solidFg = composite(parseColor(fg), solidBg);
  const l1 = luminance(solidFg);
  const l2 = luminance(solidBg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
