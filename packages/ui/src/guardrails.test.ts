// @vitest-environment node
/**
 * Guardrail: no raw colours or pixel values outside packages/tokens.
 * Every colour, size and space in the components comes from a --dp-* token.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL(".", import.meta.url));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(css|tsx?)$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name) ? [path] : [];
  });
}

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const PX = /\b\d+(\.\d+)?px\b/;
const RGB = /\b(rgba?|hsla?|oklch)\(/;

describe("no raw colours or px in packages/ui", () => {
  for (const file of files(root)) {
    const rel = file.slice(root.length);
    it(rel, () => {
      const lines = readFileSync(file, "utf8").split("\n");
      const bad = lines
        .map((line, i) => ({ line: line.replace(/\/\*.*?\*\/|\/\/.*$/g, ""), n: i + 1 }))
        .filter(({ line }) => HEX.test(line) || PX.test(line) || RGB.test(line))
        .map(({ line, n }) => `${n}: ${line.trim()}`);
      expect(bad).toEqual([]);
    });
  }
});
