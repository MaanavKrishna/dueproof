import {
  type BrandName,
  type Contrast,
  type Density,
  type Theme,
  themeAttributes,
} from "@dueproof/tokens";
import type { ComponentProps, ReactNode } from "react";
import { MotionProvider } from "../../motion";
import { cx } from "../../utils/cx";
import { ToastProvider } from "../Toast/Toast";
import { TooltipProvider } from "../Tooltip/Tooltip";
import styles from "./UIProvider.module.css";

export interface UIProviderProps {
  children: ReactNode;
  /** Label for the toast region. */
  toastLabel?: string;
}

/**
 * Everything components need, once at the app root: Motion (domAnimation,
 * reduced motion honoured), tooltip timing and the toast queue.
 * Theme, brand and density are attributes on <html> (see @dueproof/tokens).
 */
export function UIProvider({ children, toastLabel }: UIProviderProps) {
  return (
    <MotionProvider>
      <TooltipProvider>
        <ToastProvider {...(toastLabel ? { label: toastLabel } : {})}>{children}</ToastProvider>
      </TooltipProvider>
    </MotionProvider>
  );
}

export interface ThemeScopeProps extends ComponentProps<"div"> {
  theme?: Theme;
  brand?: BrandName;
  density?: Density;
  contrast?: Contrast;
  /** Paint the canvas background and text colour (default true). */
  paint?: boolean;
}

/**
 * Applies a theme, brand, density or contrast to a subtree, e.g. a preview
 * or a dark inspector inside a light page. Apps normally set these on <html>.
 */
export function ThemeScope({
  theme,
  brand,
  density,
  contrast,
  paint = true,
  className,
  ...rest
}: ThemeScopeProps) {
  return (
    <div
      {...themeAttributes({
        ...(theme ? { theme } : {}),
        ...(brand ? { brand } : {}),
        ...(density ? { density } : {}),
        ...(contrast ? { contrast } : {}),
      })}
      className={cx(paint && styles.paint, className)}
      {...rest}
    />
  );
}
