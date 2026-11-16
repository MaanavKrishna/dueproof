/**
 * The token format: W3C Design Tokens (DTCG) style.
 *
 * - A token is an object with `$value` and `$type` (and optionally `$description`).
 * - A group is any other object; its keys become path segments.
 * - `{group.token}` in a `$value` is an alias, resolved at build time.
 * - Colour tokens that change with the colour scheme carry their other
 *   values in `$extensions["dev.dueproof.modes"]`: `dark`, and the
 *   high-contrast overrides `lightHC` / `darkHC`. `$value` is the light value.
 */

export type TokenType =
  | "color"
  | "dimension"
  | "fontFamily"
  | "fontWeight"
  | "number"
  | "duration"
  | "cubicBezier"
  | "shadow"
  | "typography"
  | "transition"
  | "string";

export const MODES_KEY = "dev.dueproof.modes";

export interface ColorModes {
  dark?: string;
  lightHC?: string;
  darkHC?: string;
}

export interface Token {
  $value: string | number;
  $type: TokenType;
  $description?: string;
  $extensions?: { [MODES_KEY]?: ColorModes };
}

export interface TokenGroup {
  [key: string]: Token | TokenGroup;
}

export function isToken(node: Token | TokenGroup): node is Token {
  return Object.hasOwn(node, "$value");
}

/** A colour that is the same in every mode. */
export function fixed(value: string, $description?: string): Token {
  return { $type: "color", $value: value, ...($description ? { $description } : {}) };
}

/** A colour with a light and dark value, and optional high-contrast overrides. */
export function scheme(light: string, dark: string, hc?: { light?: string; dark?: string }): Token {
  const modes: ColorModes = { dark };
  if (hc?.light) modes.lightHC = hc.light;
  if (hc?.dark) modes.darkHC = hc.dark;
  return { $type: "color", $value: light, $extensions: { [MODES_KEY]: modes } };
}

export function dim(value: number, unit: "px" | "rem" | "ch" | "%" = "px"): Token {
  return { $type: "dimension", $value: `${value}${unit}` };
}

export function num(value: number, $type: TokenType = "number"): Token {
  return { $type, $value: value };
}

export function str(value: string, $type: TokenType = "string"): Token {
  return { $type, $value: value };
}

/** camelCase → kebab-case, for CSS variable names. */
export function kebab(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

export function cssVarName(path: readonly string[]): string {
  return `--dp-${path.map(kebab).join("-")}`;
}
