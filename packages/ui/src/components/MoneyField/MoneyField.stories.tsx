import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Stack } from "../../stories/helpers";
import { MoneyField } from "./MoneyField";

const meta = {
  title: "Forms/MoneyField",
  component: MoneyField,
  args: { label: "Amount demanded" },
} satisfies Meta<typeof MoneyField>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

function Controlled() {
  const [paise, setPaise] = useState<number | null>(45230050);
  return (
    <Stack gap={8}>
      <MoneyField label="Tax" value={paise} onValueChange={setPaise} />
      <span style={{ font: "var(--dp-text-mono-font)", color: "var(--dp-fg-secondary)" }}>
        value (paise): {String(paise)}
      </span>
    </Stack>
  );
}

export const AllStates: Story = {
  render: () => (
    <Stack width="320px">
      <Controlled />
      <MoneyField
        label="Penalty"
        description="Section 73(9): 10% of tax or ₹10,000, whichever is higher."
      />
      <MoneyField label="Interest" defaultValue={1234567890} />
      <MoneyField label="Whole rupees" allowPaise={false} defaultValue={500000} />
      <MoneyField label="Paid" error="Paid can't be more than demanded." defaultValue={99900000} />
      <MoneyField label="Locked" disabled defaultValue={100000} />
    </Stack>
  ),
};
