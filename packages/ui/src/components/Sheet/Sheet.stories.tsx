import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "../../stories/helpers";
import { Button } from "../Button/Button";
import { DueChip } from "../DueChip/DueChip";
import { Sheet } from "./Sheet";

const meta = {
  title: "Overlays/Sheet",
  component: Sheet,
  args: { title: "GST ASMT-10" },
} satisfies Meta<typeof Sheet>;
export default meta;
type Story = StoryObj<typeof meta>;

const body = (
  <Stack gap={12}>
    <DueChip state="week" detail="Fri 20 Nov" />
    <p style={{ margin: 0, font: "var(--dp-text-reading-font)" }}>
      Scrutiny of returns for FY 2024–25. Difference of ₹4,52,300 between GSTR-1 and GSTR-3B.
    </p>
  </Stack>
);

export const Right: Story = {
  render: () => (
    <Sheet
      trigger={<Button>Open inspector</Button>}
      title="GST ASMT-10"
      description="Arora Textiles Pvt Ltd · 07AAACA1234F1Z5"
      footer={<Button variant="primary">Mark as replied</Button>}
    >
      {body}
    </Sheet>
  ),
};

export const Bottom: Story = {
  render: () => (
    <Sheet trigger={<Button>Open sheet</Button>} side="bottom" title="Capture">
      {body}
    </Sheet>
  ),
};

export const NonModal: Story = {
  render: () => (
    <Sheet trigger={<Button>Open (page stays usable)</Button>} modal={false} title="Inspector">
      {body}
    </Sheet>
  ),
};
