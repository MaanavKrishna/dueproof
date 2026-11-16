import type { Icon } from "@dueproof/icons";
import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { cx } from "../../utils/cx";
import { Spinner } from "../Spinner/Spinner";
import styles from "./Button.module.css";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "plain"
  | "ghost"
  | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ComponentProps<"button"> {
  /**
   * primary: the one main action on a screen (signature colour).
   * secondary: other actions. tertiary: tinted, quieter than primary.
   * plain: text-only, in the signature colour. ghost: neutral and quiet (toolbars,
   * icon buttons). destructive: irreversible or harmful actions.
   */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon. */
  icon?: Icon;
  /** Trailing icon (e.g. a chevron for a menu). */
  iconEnd?: Icon;
  /** Shows a spinner, keeps the width, and blocks clicks while work runs. */
  loading?: boolean;
  fullWidth?: boolean;
  children?: ReactNode;
}

const iconSize = { sm: 16, md: 18, lg: 20 } as const;

export function Button({
  variant = "secondary",
  size = "md",
  icon: LeadingIcon,
  iconEnd: TrailingIcon,
  loading = false,
  fullWidth = false,
  disabled,
  type = "button",
  className,
  children,
  onClick,
  ...rest
}: ButtonProps) {
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (loading) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };
  return (
    <button
      type={type}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      data-loading={loading || undefined}
      className={cx(
        styles.button,
        styles[variant],
        styles[size],
        fullWidth && styles.fullWidth,
        !children && styles.iconOnly,
        className,
      )}
      onClick={handleClick}
      {...rest}
    >
      <span className={styles.content}>
        {LeadingIcon ? <LeadingIcon size={iconSize[size]} /> : null}
        {children ? <span className={styles.label}>{children}</span> : null}
        {TrailingIcon ? <TrailingIcon size={iconSize[size]} /> : null}
      </span>
      {loading ? (
        <span className={styles.spinner}>
          <Spinner size={size === "lg" ? "md" : "sm"} label={null} />
        </span>
      ) : null}
    </button>
  );
}
