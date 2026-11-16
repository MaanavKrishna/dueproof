import { useEffect, useState } from "react";

/**
 * True when a key press should go to the focused field, not to a shortcut:
 * single-key shortcuts never fire while someone is typing (02 §11a).
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type;
    return !["checkbox", "radio", "button", "submit", "reset", "range"].includes(type);
  }
  return target.getAttribute("role") === "combobox";
}

/** Read a length token (e.g. --dp-size-row) as a number of CSS pixels. */
export function readTokenPx(name: string, element?: Element | null, fallback = 0): number {
  if (typeof window === "undefined") return fallback;
  const el = element ?? document.documentElement;
  const raw = getComputedStyle(el).getPropertyValue(name).trim();
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * A length token as a number, re-read when theme, density or contrast change
 * on <html> (density switches row heights at runtime).
 */
export function useTokenPx(name: string, fallback: number): number {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    const read = () => setValue(readTokenPx(name, document.documentElement, fallback));
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-density", "data-theme", "data-contrast"],
    });
    return () => observer.disconnect();
  }, [name, fallback]);
  return value;
}

/** Match a media query; false on the server. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);
  return matches;
}
