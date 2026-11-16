import { type ComponentProps, useSyncExternalStore } from "react";
import { cx } from "../../utils/cx";
import styles from "./Kbd.module.css";

export interface KbdProps extends ComponentProps<"kbd"> {
  /**
   * Keys of a shortcut, e.g. ["mod", "K"]. `mod` renders ⌘ on Apple platforms
   * and Ctrl elsewhere. Without `keys`, renders its children.
   */
  keys?: string[];
  /** Force the platform (defaults to detecting it in the browser). */
  platform?: "apple" | "other";
}

const appleSymbols: Record<string, string> = {
  mod: "⌘",
  shift: "⇧",
  alt: "⌥",
  option: "⌥",
  ctrl: "⌃",
  enter: "↩",
  backspace: "⌫",
  escape: "esc",
};
const otherNames: Record<string, string> = {
  mod: "Ctrl",
  shift: "Shift",
  alt: "Alt",
  option: "Alt",
  ctrl: "Ctrl",
  enter: "Enter",
  backspace: "Backspace",
  escape: "Esc",
};

function detectApple(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}
const noSubscribe = () => () => {};

/** True on Apple platforms. Server-rendered as false, corrected after hydration. */
export function useIsApple(): boolean {
  return useSyncExternalStore(noSubscribe, detectApple, () => false);
}

/** A key or keyboard shortcut. */
export function Kbd({ keys, platform, className, children, ...rest }: KbdProps) {
  const isApple = useIsApple();
  if (!keys) {
    return (
      <kbd className={cx(styles.kbd, className)} {...rest}>
        {children}
      </kbd>
    );
  }
  const apple = platform ? platform === "apple" : isApple;
  const names = apple ? appleSymbols : otherNames;
  return (
    <kbd className={cx(styles.group, className)} {...rest}>
      {keys.map((k, i) => (
        // Keys can repeat (e.g. "G G"), so the index is part of the key.
        // biome-ignore lint/suspicious/noArrayIndexKey: static, ordered list
        <kbd key={`${k}-${i}`} className={styles.kbd}>
          {names[k.toLowerCase()] ?? k.toUpperCase()}
        </kbd>
      ))}
    </kbd>
  );
}
