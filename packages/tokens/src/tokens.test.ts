import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BRANDS, buildCss, buildVarsTs, resolveColor } from "./build";
import { contrast } from "./color-math";
import { checkContrast } from "./contrast";
import { vars } from "./generated/vars";

const generated = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./generated/${name}`, import.meta.url)), "utf8");
/** The committed files are run through the formatter; compare ignoring layout and hex case. */
const normalise = (s: string) =>
  s
    .replace(/\s+/g, "")
    .replace(/,(?=[)}\]])/g, "")
    .toLowerCase();

describe("contrast (WCAG AA) for every brand × mode", () => {
  const results = checkContrast();
  it("checks every brand in light, dark and both high-contrast modes", () => {
    expect(new Set(results.map((r) => `${r.brand}/${r.mode}`)).size).toBe(BRANDS.length * 4);
  });
  for (const r of results) {
    it(`${r.brand} ${r.mode}: ${r.fg} on ${r.bg} ≥ ${r.min}`, () => {
      expect(r.ratio, `${r.ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(r.min);
    });
  }
});

describe("colour maths", () => {
  it("matches known WCAG ratios", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
  });
  it("composites translucent colours", () => {
    expect(contrast("#000000", "rgb(255 255 255 / 0.5)", "#000000")).toBeCloseTo(5.28, 1);
  });
});

describe("generated files", () => {
  it("tokens.css is up to date (run pnpm --filter @dueproof/tokens build:css)", () => {
    expect(normalise(generated("tokens.css"))).toBe(normalise(buildCss()));
  });
  it("vars.ts is up to date", () => {
    expect(normalise(generated("vars.ts"))).toBe(normalise(buildVarsTs()));
  });
  it("exposes typed var references", () => {
    expect(vars.fg.primary).toBe("var(--dp-fg-primary)");
    expect(vars.due.overdue.fg).toBe("var(--dp-due-overdue-fg)");
    expect(vars.accent.solid).toBe("var(--dp-accent-solid)");
    expect(vars.size.control.md).toBe("var(--dp-size-control-md)");
  });
});

describe("themes and brands", () => {
  const css = buildCss();
  it("defines all three brands and themes", () => {
    for (const b of BRANDS) expect(css).toContain(`[data-brand="${b}"]`);
    for (const t of ["light", "dark", "system"]) expect(css).toContain(`[data-theme="${t}"]`);
    expect(css).toContain("@media (prefers-contrast: more)");
    expect(css).toContain('[data-density="compact"]');
  });
  it("keeps the document page white in every theme", () => {
    for (const b of BRANDS) {
      for (const m of ["light", "dark", "lightHC", "darkHC"] as const) {
        expect(resolveColor("bg.page", b, m)).toBe("#FFFFFF");
      }
    }
  });
  it("gives each brand its own signature and proof colour", () => {
    const accents = new Set(BRANDS.map((b) => resolveColor("accent.solid", b)));
    const proofs = new Set(BRANDS.map((b) => resolveColor("proof.highlight", b)));
    expect(accents.size).toBe(3);
    expect(proofs.size).toBe(3);
  });
  it("keeps the proof colour for evidence only", () => {
    for (const b of BRANDS) {
      const proof = resolveColor("proof.highlight", b);
      expect(css.split(proof).length - 1).toBeGreaterThan(0);
      expect(resolveColor("feedback.warning.bg", b)).not.toBe(proof);
      expect(resolveColor("due.today.bg", b)).not.toBe(proof);
    }
  });
});
