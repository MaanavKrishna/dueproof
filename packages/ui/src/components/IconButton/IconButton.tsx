import type { Icon } from "@dueproof/icons";
import { Button, type ButtonProps } from "../Button/Button";
import { Tooltip } from "../Tooltip/Tooltip";

export interface IconButtonProps
  extends Omit<ButtonProps, "children" | "icon" | "iconEnd" | "fullWidth"> {
  icon: Icon;
  /** Required: the accessible name, also shown as a tooltip. */
  label: string;
  /** Show the label as a tooltip on hover and focus. Default true. */
  tooltip?: boolean;
  /** Keyboard shortcut shown in the tooltip, e.g. "⌘K". */
  shortcut?: string;
}

/** A square button with only an icon. Always has a label for screen readers. */
export function IconButton({
  icon,
  label,
  tooltip = true,
  shortcut,
  variant = "ghost",
  ...rest
}: IconButtonProps) {
  const button = <Button icon={icon} aria-label={label} variant={variant} {...rest} />;
  if (!tooltip) return button;
  return (
    <Tooltip content={label} shortcut={shortcut}>
      {button}
    </Tooltip>
  );
}
