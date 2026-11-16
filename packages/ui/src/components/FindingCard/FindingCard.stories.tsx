import { MoreIcon } from "@dueproof/icons";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { asmt10Order } from "../../stories/fixtures";
import { Stack } from "../../stories/helpers";
import { IconButton } from "../IconButton/IconButton";
import { FindingCard, type FindingCardProps } from "./FindingCard";

const reply: FindingCardProps = {
  duty: "Reply to the notice explaining the ITC and outward-supply differences",
  due: { state: "week", date: "20 Nov 2026" },
  basis: "30 days from receipt on 21 Oct 2026",
  owner: { name: "Ananya Iyer" },
  status: { label: "Drafting", tone: "accent" },
  origin: "rule",
  verification: { state: "verified", page: 1 },
  grade: "exact",
  quote: "reply within a period of thirty days from the date of service of this notice",
  sourceLabel: "Page 1",
  onShowSource: () => {},
  actions: <IconButton icon={MoreIcon} label="More" size="sm" />,
};

const hearing: FindingCardProps = {
  duty: "Attend the personal hearing at CGST Range IV, Andheri (if requested)",
  due: { state: "later", date: "27 Nov 2026, 11:30" },
  basis: "Stated on the annexure",
  owner: { name: "Rahul Mehta" },
  status: { label: "Open", tone: "neutral" },
  origin: "rule+ai",
  verification: { state: "verified", page: 2 },
  grade: "approximate",
  sourceLabel: "Page 2",
  onShowSource: () => {},
};

const review: FindingCardProps = {
  duty: "Reverse excess ITC of ₹3,18,400 with interest under section 50",
  basis: "Interest from the date of availment — computed once confirmed.",
  status: { label: "Needs review", tone: "warning" },
  origin: "ai",
  verification: { state: "suggested" },
  grade: "unlocated",
  sourceLabel: "Expected on page 1",
  onShowSource: () => {},
  needsReview: true,
  reviewReason: "The AI suggested this, but the quote wasn't found on the page.",
  onConfirm: () => {},
  onEdit: () => {},
  onDismiss: () => {},
};

const appeal: FindingCardProps = {
  duty: asmt10Order.duty,
  due: asmt10Order.due,
  basis: asmt10Order.basis,
  condonation: asmt10Order.condonation,
  owner: { name: "Priya Sharma" },
  status: { label: "Open", tone: "neutral" },
  origin: "rule",
  verification: { state: "verified", page: 3 },
  grade: "exact",
  sourceLabel: "Order, page 3",
  onShowSource: () => {},
};

const meta: Meta<typeof FindingCard> = {
  title: "Dueproof/FindingCard",
  component: FindingCard,
  args: reply,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: "36rem" }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof FindingCard>;

export const Verified: Story = {};
export const Selected: Story = { args: { selected: true } };
export const ApproximateMatch: Story = { render: () => <FindingCard {...hearing} /> };
export const NeedsReview: Story = { render: () => <FindingCard {...review} /> };
/** An order's appeal window: the normal last date and the condonation window stay separate. */
export const WithCondonationWindow: Story = { render: () => <FindingCard {...appeal} /> };
export const Done: Story = {
  args: {
    due: { state: "done", date: "18 Nov 2026" },
    status: { label: "Filed", tone: "success" },
  },
};
export const List: Story = {
  render: () => (
    <Stack>
      <FindingCard {...reply} />
      <FindingCard {...hearing} />
      <FindingCard {...review} />
    </Stack>
  ),
};
