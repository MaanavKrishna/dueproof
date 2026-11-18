import { type RefObject, useCallback, useLayoutEffect, useRef } from "react";

/**
 * Where focus goes when a dialog or sheet closes (WCAG 2.4.3).
 *
 * Radix returns focus to its `Trigger`. A dialog opened from code (a menu item,
 * a pencil button, a shortcut) has no trigger, so focus fell to <body>. This
 * remembers the element that had focus when the dialog opened, and gives it
 * focus back on close: `returnFocus` if given, else that element. If it has
 * left the page (a menu item), focus goes to the nearest element that
 * controlled it, or stays where Radix puts it.
 */
export function useReturnFocus(
  open: boolean,
  hasTrigger: boolean,
  returnFocus?: RefObject<HTMLElement | null>,
) {
  const opener = useRef<HTMLElement | null>(null);
  const menuTrigger = useRef<HTMLElement | null>(null);

  // A layout effect runs before Radix's FocusScope (a passive effect) moves
  // focus into the dialog, so activeElement is still the opener here.
  useLayoutEffect(() => {
    if (!open || typeof document === "undefined") return;
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
    // An item in a menu disappears when the menu closes; remember the button
    // that opened the menu as a fallback.
    const menu = opener.current?.closest<HTMLElement>("[role=menu]");
    const labelledBy = menu?.getAttribute("aria-labelledby");
    menuTrigger.current = labelledBy ? document.getElementById(labelledBy) : null;
  }, [open]);

  return useCallback(
    (event: Event) => {
      const target =
        returnFocus?.current ??
        (hasTrigger
          ? null
          : [opener.current, menuTrigger.current].find((el) => el?.isConnected) ?? null);
      if (!target) return;
      event.preventDefault();
      target.focus();
    },
    [hasTrigger, returnFocus],
  );
}
