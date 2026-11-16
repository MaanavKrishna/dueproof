/**
 * @dueproof/tokens — the design tokens of Ledger, Dueproof's design system.
 *
 * - CSS: `import "@dueproof/tokens/tokens.css"` defines every `--dp-*` variable.
 * - TS:  `vars.fg.primary` → `"var(--dp-fg-primary)"`, plus motion springs,
 *        breakpoints and type styles as plain values.
 */
import type { BrandName } from "./source/color";

export { BRANDS, MODES, type Mode, resolveColor } from "./build";
export { contrast } from "./color-math";
export { checkContrast, pairs as contrastPairs } from "./contrast";
export { type Vars, vars } from "./generated/vars";
export { breakpoints, motion, target, typeStyles } from "./source/base";
export { type BrandName, defaultBrand } from "./source/color";

export type Theme = "light" | "dark" | "system";
export type Density = "comfortable" | "compact";
export type Contrast = "normal" | "more";
export type Brand = BrandName;

export const themes: readonly Theme[] = ["light", "dark", "system"];
export const densities: readonly Density[] = ["comfortable", "compact"];

export const brandLabels: Record<BrandName, string> = {
  "ink-saffron": "Ink & Saffron",
  "graphite-electric": "Graphite & Electric",
  "forest-paper": "Forest & Paper",
};

/** Attributes to put on <html> (or a wrapper) to apply a theme, brand, density and contrast. */
export function themeAttributes(opts: {
  theme?: Theme;
  brand?: BrandName;
  density?: Density;
  contrast?: Contrast;
}): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (opts.theme) attrs["data-theme"] = opts.theme;
  if (opts.brand) attrs["data-brand"] = opts.brand;
  if (opts.density) attrs["data-density"] = opts.density;
  if (opts.contrast === "more") attrs["data-contrast"] = "more";
  return attrs;
}
