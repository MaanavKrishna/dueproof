/**
 * Per-person display preferences: theme and density. Kept in cookies, so the
 * server renders <html> with the right attributes and nothing flashes, and
 * mirrored to localStorage for the no-flash script (desktop shell, a fresh
 * browser profile). Pure: shared by the root layout, the server action and
 * the client menu.
 */
import type { Density, Theme } from "@dueproof/tokens";

export const THEME_COOKIE = "dp-theme";
export const DENSITY_COOKIE = "dp-density";
export const PREFS_STORAGE_KEY = "dp-prefs";
/** One year. */
export const PREFS_MAX_AGE = 60 * 60 * 24 * 365;

export const THEMES: readonly Theme[] = ["light", "dark", "system"];
export const DENSITIES: readonly Density[] = ["comfortable", "compact"];

export interface Preferences {
  theme: Theme;
  density: Density;
}

/** "system" follows the device (L6): a dark-mode user never gets a white app. */
export const DEFAULT_PREFERENCES: Preferences = { theme: "system", density: "comfortable" };

export function parseTheme(value: unknown): Theme | undefined {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value)
    ? (value as Theme)
    : undefined;
}

export function parseDensity(value: unknown): Density | undefined {
  return typeof value === "string" && (DENSITIES as readonly string[]).includes(value)
    ? (value as Density)
    : undefined;
}

/** Preferences from cookie values, with defaults; `fromCookie` says whether any were set. */
export function readPreferences(cookies: {
  theme?: string | undefined;
  density?: string | undefined;
}): Preferences & { fromCookie: boolean } {
  const theme = parseTheme(cookies.theme);
  const density = parseDensity(cookies.density);
  return {
    theme: theme ?? DEFAULT_PREFERENCES.theme,
    density: density ?? DEFAULT_PREFERENCES.density,
    fromCookie: theme !== undefined || density !== undefined,
  };
}

/**
 * The inline script that runs before first paint. When the server had no
 * cookie (the desktop shell, a fresh browser profile), it applies the last
 * choice saved in localStorage. Values are checked against the allow-lists,
 * so nothing from storage reaches the DOM unchecked.
 */
export function noFlashScript(): string {
  const themes = JSON.stringify(THEMES);
  const densities = JSON.stringify(DENSITIES);
  const key = JSON.stringify(PREFS_STORAGE_KEY);
  return `(function(){try{var d=document.documentElement;if(d.dataset.prefs==="cookie")return;var p=JSON.parse(localStorage.getItem(${key})||"{}");if(${themes}.indexOf(p.theme)>=0)d.dataset.theme=p.theme;if(${densities}.indexOf(p.density)>=0)d.dataset.density=p.density;}catch(e){}})();`;
}
