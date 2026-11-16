/**
 * @dueproof/ui — Ledger, Dueproof's component library.
 *
 * Setup, once at the app root:
 *   import "@dueproof/ui/styles.css";          // tokens + base styles
 *   <html data-theme="light" data-brand="ink-saffron" data-density="comfortable">
 *   <UIProvider>{app}</UIProvider>
 */

// Tier 2 — structure, and Tier 3 — Dueproof's own
export {
  ActivityFeed,
  type ActivityFeedProps,
  type ActivityItem,
  type ActivityKind,
} from "./components/ActivityFeed/ActivityFeed";
export {
  AIBadge,
  type AIBadgeProps,
  type FindingOrigin,
  OriginBadge,
  type OriginBadgeProps,
} from "./components/AIBadge/AIBadge";
export { Amount, type AmountProps } from "./components/Amount/Amount";
export {
  AppShell,
  type AppShellProps,
  type LinkRenderProps,
  MobileNav,
  type MobileNavItem,
  useAppShell,
} from "./components/AppShell/AppShell";
export { SplitView, type SplitViewProps } from "./components/AppShell/SplitView";
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
  type BreadcrumbItem,
  Breadcrumbs,
  type BreadcrumbsProps,
} from "./components/Breadcrumbs/Breadcrumbs";
export {
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
} from "./components/Button/Button";
export {
  Calendar,
  type CalendarEvent,
  type CalendarEventKind,
  type CalendarHoliday,
  type CalendarProps,
  type CalendarView,
} from "./components/Calendar/Calendar";
export {
  Card,
  type CardProps,
  Sparkline,
  type SparklineProps,
  StatCard,
  type StatCardProps,
  type StatDelta,
} from "./components/Card/Card";
export { Checkbox, type CheckboxProps } from "./components/Checkbox/Checkbox";
export {
  ClientHeader,
  type ClientHeaderProps,
  type ClientIdentifier,
} from "./components/ClientHeader/ClientHeader";
export {
  checkIdentifier,
  gstinCheckChar,
  type IdentifierCheck,
  type IdentifierType,
} from "./components/ClientHeader/identifiers";
export { Combobox, type ComboboxOption, type ComboboxProps } from "./components/Combobox/Combobox";
export {
  type Command,
  CommandPalette,
  type CommandPaletteProps,
} from "./components/CommandPalette/CommandPalette";
export { type FuzzyMatch, fuzzyMatch, fuzzyScore } from "./components/CommandPalette/fuzzy";
export {
  CommentComposer,
  type CommentComposerProps,
  type CommentSubmission,
  type MentionUser,
} from "./components/CommentComposer/CommentComposer";
export { ConfirmDialog, type ConfirmDialogProps } from "./components/ConfirmDialog/ConfirmDialog";
export {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  type ContextMenuItemProps,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "./components/ContextMenu/ContextMenu";
export {
  type ColumnWidth,
  DataTable,
  type DataTableColumn,
  type DataTableError,
  type DataTableProps,
  type DataTableSort,
  type SortValue,
} from "./components/DataTable/DataTable";
export {
  type DateHelper,
  DatePicker,
  type DatePickerProps,
  type DateResolver,
  type DayCountKind,
} from "./components/DatePicker/DatePicker";
export { Dialog, DialogClose, type DialogProps } from "./components/Dialog/Dialog";
export { Divider, type DividerProps } from "./components/Divider/Divider";
export { DueChip, type DueChipProps, type DueState, dueLadder } from "./components/DueChip/DueChip";
export { EmptyState, type EmptyStateProps } from "./components/EmptyState/EmptyState";
export {
  type ExposureRow,
  ExposureSummary,
  type ExposureSummaryProps,
} from "./components/ExposureSummary/ExposureSummary";
export {
  Field,
  type FieldBaseProps,
  type FieldProps,
  type FieldRenderProps,
} from "./components/Field/Field";
export {
  FileDropZone,
  type FileDropZoneProps,
  type FileRejection,
} from "./components/FileDropZone/FileDropZone";
export {
  type UploadItem,
  type UploadStage,
  UploadTray,
  type UploadTrayProps,
} from "./components/FileDropZone/UploadTray";
export {
  FilterBar,
  type FilterBarProps,
  type FilterDefinition,
  type FilterOption,
  type FilterValue,
  type SavedView,
} from "./components/FilterBar/FilterBar";
export { FindingCard, type FindingCardProps } from "./components/FindingCard/FindingCard";
export { IconButton, type IconButtonProps } from "./components/IconButton/IconButton";
export {
  InsetGroupedList,
  type InsetGroupedListProps,
  ListRow,
  type ListRowProps,
} from "./components/InsetGroupedList/InsetGroupedList";
export { Kbd, type KbdProps, useIsApple } from "./components/Kbd/Kbd";
export {
  LanguageIndicator,
  type LanguageIndicatorProps,
} from "./components/LanguageIndicator/LanguageIndicator";
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
  type NoticeAuthority,
  NoticeHeader,
  type NoticeHeaderProps,
} from "./components/NoticeHeader/NoticeHeader";
export {
  NotificationCenter,
  type NotificationCenterProps,
  type NotificationItem,
} from "./components/NotificationCenter/NotificationCenter";
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
  GradeBadge,
  type GradeBadgeProps,
  type ProofGrade,
  proofGrades,
} from "./components/ProofViewer/grades";
export {
  highlightLabel,
  type ProofHighlight,
  type ProofPage,
  type ProofRect,
  ProofViewer,
  type ProofViewerProps,
  type ProofZoom,
} from "./components/ProofViewer/ProofViewer";
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
export {
  SettingsLayout,
  type SettingsLayoutProps,
  type SettingsNavItem,
  SettingsRow,
  type SettingsRowProps,
  SettingsSection,
  type SettingsSectionProps,
} from "./components/SettingsLayout/SettingsLayout";
export { Sheet, type SheetProps, type SheetSide } from "./components/Sheet/Sheet";
export {
  SidebarNav,
  type SidebarNavItem,
  type SidebarNavProps,
  type SidebarNavSection,
} from "./components/SidebarNav/SidebarNav";
export {
  Skeleton,
  type SkeletonProps,
  SkeletonText,
  type SkeletonTextProps,
} from "./components/Skeleton/Skeleton";
export { Spinner, type SpinnerProps } from "./components/Spinner/Spinner";
export {
  type CaseStage,
  caseStages,
  StageStepper,
  type StageStepperProps,
} from "./components/StageStepper/StageStepper";
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
  Timeline,
  type TimelineItem,
  type TimelineProps,
  type TimelineTone,
} from "./components/Timeline/Timeline";
export {
  type ToastOptions,
  ToastProvider,
  type ToastProviderProps,
  type ToastTone,
  useToast,
} from "./components/Toast/Toast";
export { Toolbar, type ToolbarProps } from "./components/Toolbar/Toolbar";
export {
  Tooltip,
  type TooltipProps,
  TooltipProvider,
  type TooltipProviderProps,
} from "./components/Tooltip/Tooltip";
export { VisuallyHidden } from "./components/VisuallyHidden/VisuallyHidden";
export {
  Workings,
  type WorkingsInput,
  type WorkingsProps,
  type WorkingsStep,
} from "./components/Workings/Workings";
// Page templates
export {
  DetailPageTemplate,
  type DetailPageTemplateProps,
  type DetailTab,
} from "./templates/DetailPageTemplate";
export { ListPageTemplate, type ListPageTemplateProps } from "./templates/ListPageTemplate";
export {
  SettingsPageTemplate,
  type SettingsPageTemplateProps,
} from "./templates/SettingsPageTemplate";
export {
  type WizardStep,
  WizardTemplate,
  type WizardTemplateProps,
} from "./templates/WizardTemplate";
export { cx } from "./utils/cx";
// Calendar-grid helpers for display (due dates themselves come from packages/core)
export {
  addDays,
  addMonths,
  type IsoDate,
  longDate,
  monthTitle,
  parseIndianDate,
  shortDate,
  todayInIST,
} from "./utils/dates";
export { isTypingTarget, useMediaQuery, useTokenPx } from "./utils/dom";
export { useControllableState } from "./utils/use-controllable";
