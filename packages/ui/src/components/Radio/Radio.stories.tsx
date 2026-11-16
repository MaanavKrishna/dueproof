import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "../../stories/helpers";
import { Radio, RadioGroup } from "./Radio";

const meta = {
  title: "Forms/Radio",
  component: RadioGroup,
  args: { label: "Count the period from", children: null },
} satisfies Meta<typeof RadioGroup>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  render: () => (
    <Stack gap={32}>
      <RadioGroup label="Count the period from" defaultValue="receipt">
        <Radio value="issue" label="Date of issue" description="The date printed on the notice." />
        <Radio
          value="receipt"
          label="Date of receipt"
          description="When the notice reached the client."
        />
        <Radio value="service" label="Date of service" disabled />
      </RadioGroup>
      <RadioGroup label="Reminder" orientation="horizontal" defaultValue="3">
        <Radio value="1" label="1 day" />
        <Radio value="3" label="3 days" />
        <Radio value="7" label="7 days" />
      </RadioGroup>
      <RadioGroup label="Outcome" error="Choose an outcome before closing.">
        <Radio value="dropped" label="Dropped" />
        <Radio value="demand" label="Demand confirmed" />
      </RadioGroup>
    </Stack>
  ),
};
