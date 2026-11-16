import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card, Stack } from "../../stories/helpers";
import { Divider } from "../Divider/Divider";
import { Switch } from "./Switch";

const meta = {
  title: "Forms/Switch",
  component: Switch,
  args: { label: "Email digest" },
} satisfies Meta<typeof Switch>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const AllStates: Story = {
  render: () => (
    <Stack width="440px">
      <Card>
        <Stack gap={12}>
          <Switch label="Email digest" description="Every weekday at 8:00 IST." defaultChecked />
          <Divider />
          <Switch label="WhatsApp reminders" />
          <Divider />
          <Switch
            label="Two-step sign-in"
            defaultChecked
            disabled
            description="Required by your organisation."
          />
        </Stack>
      </Card>
      <Switch label="Label after" labelPosition="end" size="sm" />
      <Switch aria-label="Standalone" />
    </Stack>
  ),
};
