import {
  CalendarDaysIcon,
  ClientIcon,
  HomeIcon,
  InboxIcon,
  NoticeIcon,
  PrintIcon,
  SettingsIcon,
  UploadIcon,
  UserIcon,
} from "@dueproof/icons";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { clients } from "../../stories/fixtures";
import { Button } from "../Button/Button";
import { Kbd } from "../Kbd/Kbd";
import { type Command, CommandPalette } from "./CommandPalette";

const noop = () => {};
const commands: Command[] = [
  {
    id: "go-today",
    label: "Today",
    group: "Go to",
    icon: HomeIcon,
    shortcut: ["G", "T"],
    onSelect: noop,
  },
  {
    id: "go-inbox",
    label: "Inbox",
    group: "Go to",
    icon: InboxIcon,
    shortcut: ["G", "I"],
    onSelect: noop,
  },
  {
    id: "go-notices",
    label: "Notices",
    group: "Go to",
    icon: NoticeIcon,
    shortcut: ["G", "N"],
    onSelect: noop,
  },
  {
    id: "go-deadlines",
    label: "Deadlines",
    group: "Go to",
    icon: CalendarDaysIcon,
    shortcut: ["G", "D"],
    onSelect: noop,
  },
  { id: "go-settings", label: "Settings", group: "Go to", icon: SettingsIcon, onSelect: noop },
  {
    id: "upload",
    label: "Upload a notice",
    group: "Actions",
    icon: UploadIcon,
    shortcut: ["mod", "U"],
    onSelect: noop,
  },
  {
    id: "assign",
    label: "Assign to…",
    group: "Actions",
    icon: UserIcon,
    keywords: ["owner"],
    onSelect: noop,
  },
  {
    id: "print",
    label: "Print evidence report",
    group: "Actions",
    icon: PrintIcon,
    onSelect: noop,
  },
  {
    id: "tally",
    label: "Export to Tally",
    group: "Actions",
    disabled: true,
    description: "Coming in 0.2",
    onSelect: noop,
  },
  ...clients.map((c) => ({
    id: `client-${c.id}`,
    label: c.name,
    group: "Clients",
    icon: ClientIcon,
    description: `${c.gstin} · ${c.city}`,
    keywords: [c.gstin, c.pan],
    onSelect: noop,
  })),
  {
    id: "n1",
    label: "ASMT-10 · ZD2710260012345",
    group: "Notices",
    icon: NoticeIcon,
    description: "Harbour Valley Foods · due 20 Nov 2026",
    onSelect: noop,
  },
  {
    id: "n2",
    label: "DRC-01 · ZD2410260098812",
    group: "Notices",
    icon: NoticeIcon,
    description: "Anand Textiles · overdue",
    onSelect: noop,
  },
];

const meta = {
  title: "Structure/CommandPalette",
  component: CommandPalette,
  args: { commands, groupOrder: ["Go to", "Actions", "Notices", "Clients"] },
} satisfies Meta<typeof CommandPalette>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = { args: { defaultOpen: true } };

export const WithRecent: Story = {
  args: { defaultOpen: true, recentIds: ["n1", "client-c1", "upload"] },
};

export const Hotkey: Story = {
  render: function Render(args) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <p>
          Press <Kbd keys={["mod", "K"]} /> anywhere, or{" "}
          <Button size="sm" onClick={() => setOpen(true)}>
            open the palette
          </Button>
          .
        </p>
        <CommandPalette {...args} open={open} onOpenChange={setOpen} />
      </>
    );
  },
};
