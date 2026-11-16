/**
 * @dueproof/ui — Ledger, Dueproof's component library.
 *
 * Setup, once at the app root:
 *   import "@dueproof/ui/styles.css";          // tokens + base styles
 *   <html data-theme="light" data-brand="ink-saffron" data-density="comfortable">
 *   <UIProvider>{app}</UIProvider>
 */

export {
  Avatar,
  type AvatarProps,
  type AvatarSize,
  AvatarStack,
  type AvatarStackProps,
  initials,
} from "./components/Avatar/Avatar";
export { Badge, type BadgeProps, type Tone } from "./components/Badge/Badge";
export { Banner, type BannerProps, type BannerTone } from "./components/Banner/Banner";
export {
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
} from "./components/Button/Button";
export { Checkbox, type CheckboxProps } from "./components/Checkbox/Checkbox";
export { Combobox, type ComboboxOption, type ComboboxProps } from "./components/Combobox/Combobox";
export { Dialog, DialogClose, type DialogProps } from "./components/Dialog/Dialog";
export { Divider, type DividerProps } from "./components/Divider/Divider";
export { DueChip, type DueChipProps, type DueState, dueLadder } from "./components/DueChip/DueChip";
export { EmptyState, type EmptyStateProps } from "./components/EmptyState/EmptyState";
export {
  Field,
  type FieldBaseProps,
  type FieldProps,
  type FieldRenderProps,
} from "./components/Field/Field";
export { IconButton, type IconButtonProps } from "./components/IconButton/IconButton";
export { Kbd, type KbdProps, useIsApple } from "./components/Kbd/Kbd";
export { Link, type LinkProps } from "./components/Link/Link";
export {
  Menu,
  MenuCheckboxItem,
  type MenuCheckboxItemProps,
  MenuContent,
  MenuGroup,
  MenuItem,
  type MenuItemProps,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from "./components/Menu/Menu";
export { MoneyField, type MoneyFieldProps } from "./components/MoneyField/MoneyField";
export { formatPaise, paiseToEditable, rupeesToPaise } from "./components/MoneyField/money";
export {
  Popover,
  PopoverAnchor,
  PopoverClose,
  PopoverContent,
  type PopoverContentProps,
  PopoverTrigger,
} from "./components/Popover/Popover";
export {
  ProgressBar,
  type ProgressBarProps,
  ProgressRing,
  type ProgressRingProps,
  type Step,
  Stepper,
  type StepperProps,
  type StepStatus,
} from "./components/Progress/Progress";
export {
  ThemeScope,
  type ThemeScopeProps,
  UIProvider,
  type UIProviderProps,
} from "./components/Provider/UIProvider";
export { Radio, RadioGroup, type RadioGroupProps, type RadioProps } from "./components/Radio/Radio";
export { SearchField, type SearchFieldProps } from "./components/SearchField/SearchField";
export {
  type Segment,
  SegmentedControl,
  type SegmentedControlProps,
} from "./components/SegmentedControl/SegmentedControl";
export {
  Select,
  type SelectGroup,
  type SelectOption,
  type SelectProps,
} from "./components/Select/Select";
export { Sheet, type SheetProps, type SheetSide } from "./components/Sheet/Sheet";
export {
  Skeleton,
  type SkeletonProps,
  SkeletonText,
  type SkeletonTextProps,
} from "./components/Skeleton/Skeleton";
export { Spinner, type SpinnerProps } from "./components/Spinner/Spinner";
export { StatusPill, type StatusPillProps } from "./components/StatusPill/StatusPill";
export { Switch, type SwitchProps } from "./components/Switch/Switch";
export {
  Tab,
  TabList,
  type TabListProps,
  TabPanel,
  type TabProps,
  Tabs,
  type TabsProps,
} from "./components/Tabs/Tabs";
export { Tag, type TagProps } from "./components/Tag/Tag";
export { TextArea, type TextAreaProps } from "./components/TextArea/TextArea";
export { TextField, type TextFieldProps } from "./components/TextField/TextField";
export {
  type ToastOptions,
  ToastProvider,
  type ToastProviderProps,
  type ToastTone,
  useToast,
} from "./components/Toast/Toast";
export {
  Tooltip,
  type TooltipProps,
  TooltipProvider,
  type TooltipProviderProps,
} from "./components/Tooltip/Tooltip";
export { VisuallyHidden } from "./components/VisuallyHidden/VisuallyHidden";
export { cx } from "./utils/cx";
export { useControllableState } from "./utils/use-controllable";
