import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card, Stack } from "../../stories/helpers";
import { Divider } from "./Divider";

const meta = {
  title: "Content/Divider",
  component: Divider,
} satisfies Meta<typeof Divider>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  render: () => (
    <Stack width="420px">
      <Card>
        <div>Full width</div>
        <Divider spacing="md" />
        <div>Inset (grouped lists)</div>
        <Divider inset spacing="md" />
        <div>End</div>
      </Card>
      <div style={{ display: "flex", alignItems: "center", height: "var(--dp-space-24)" }}>
        Left
        <Divider orientation="vertical" spacing="md" />
        Right
      </div>
    </Stack>
  ),
};
