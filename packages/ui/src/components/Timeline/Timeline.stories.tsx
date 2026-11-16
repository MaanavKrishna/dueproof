import {
  AppealIcon,
  FiledAckIcon,
  HearingIcon,
  NoticeIcon,
  OrderIcon,
  ReceiptIcon,
} from "@dueproof/icons";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../Button/Button";
import { Timeline } from "./Timeline";

const meta = {
  title: "Structure/Timeline",
  component: Timeline,
  args: {
    "aria-label": "Case thread",
    items: [
      {
        id: "1",
        title: "ASMT-10 received",
        time: "21 Oct 2026",
        dateTime: "2026-10-21",
        icon: NoticeIcon,
        tone: "proof",
        description: "2 pages · by email from CGST Range IV",
        meta: (
          <Button size="sm" variant="plain">
            Open
          </Button>
        ),
      },
      {
        id: "2",
        title: "Supplier invoices gathered",
        time: "2 Nov 2026",
        dateTime: "2026-11-02",
        icon: ReceiptIcon,
        description: "14 invoices from 2 suppliers",
      },
      {
        id: "3",
        title: "Reply filed on the portal",
        time: "18 Nov 2026",
        icon: FiledAckIcon,
        tone: "accent",
        status: "current",
        description: "Waiting for the acknowledgement (ARN)",
      },
      {
        id: "4",
        title: "Personal hearing",
        time: "27 Nov 2026, 11:30",
        icon: HearingIcon,
        status: "upcoming",
      },
      { id: "5", title: "Order", icon: OrderIcon, status: "upcoming" },
      {
        id: "6",
        title: "Appeal (if needed)",
        icon: AppealIcon,
        status: "upcoming",
        description: "3 months from the order, plus 1 if condoned",
      },
    ],
  },
} satisfies Meta<typeof Timeline>;
export default meta;
type Story = StoryObj<typeof meta>;

export const CaseThread: Story = {};
export const Compact: Story = { args: { density: "compact" } };
export const Tones: Story = {
  args: {
    items: (["neutral", "accent", "success", "warning", "danger", "proof"] as const).map((t) => ({
      id: t,
      title: `Tone: ${t}`,
      icon: NoticeIcon,
      tone: t,
    })),
  },
};
