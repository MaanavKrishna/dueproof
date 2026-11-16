import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "../../stories/helpers";
import { TextArea } from "./TextArea";

const meta = {
  title: "Forms/TextArea",
  component: TextArea,
  args: { label: "Note to the team", placeholder: "What should the reviewer check?" },
} satisfies Meta<typeof TextArea>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const AllStates: Story = {
  render: () => (
    <Stack width="480px">
      <TextArea label="Reply draft" description="Grows as you type." />
      <TextArea label="Reason for correction" error="Say why the date changed." />
      <TextArea label="Optional note" optional rows={2} />
      <TextArea label="Locked" disabled defaultValue="Approved by R. Mehta on 12 Nov 2026." />
    </Stack>
  ),
};
