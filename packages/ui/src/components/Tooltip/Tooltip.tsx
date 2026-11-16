import { Tooltip as RadixTooltip } from "radix-ui";
import { createContext, type ReactElement, type ReactNode, useContext } from "react";
import { cx } from "../../utils/cx";
import styles from "./Tooltip.module.css";

const ProviderPresent = createContext(false);

export interface TooltipProviderProps {
  children: ReactNode;
  /** Delay before the first tooltip opens, in ms. */
  delayDuration?: number;
}

/** Shares open delays between tooltips (moving between them is instant). Included in UIProvider. */
export function TooltipProvider({ children, delayDuration = 500 }: TooltipProviderProps) {
  return (
    <RadixTooltip.Provider delayDuration={delayDuration} skipDelayDuration={300}>
      <ProviderPresent.Provider value={true}>{children}</ProviderPresent.Provider>
    </RadixTooltip.Provider>
  );
}

export interface TooltipProps {
  /** The trigger: a single focusable element (it receives the props). */
  children: ReactElement;
  content: ReactNode;
  /** A keyboard shortcut shown after the content, e.g. "⌘K". */
  shortcut?: string | undefined;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

/**
 * A short label on hover and keyboard focus. Supplementary only: never put
 * the only copy of important information in a tooltip.
 */
export function Tooltip({
  children,
  content,
  shortcut,
  side = "top",
  align = "center",
  className,
  ...state
}: TooltipProps) {
  const hasProvider = useContext(ProviderPresent);
  const tooltip = (
    <RadixTooltip.Root {...state}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cx(styles.tooltip, className)}
        >
          {content}
          {shortcut ? <kbd className={styles.shortcut}>{shortcut}</kbd> : null}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
  return hasProvider ? tooltip : <TooltipProvider>{tooltip}</TooltipProvider>;
}
