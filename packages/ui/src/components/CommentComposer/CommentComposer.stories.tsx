import type { Meta, StoryObj } from "@storybook/react-vite";
import { people } from "../../stories/fixtures";
import { CommentComposer } from "./CommentComposer";

const meta = {
  title: "Structure/CommentComposer",
  component: CommentComposer,
  args: {
    users: people,
    author: { id: "u2", name: "Rahul Mehta" },
    onSubmit: () => new Promise<void>((r) => setTimeout(r, 600)),
  },
  parameters: { layout: "padded" },
} satisfies Meta<typeof CommentComposer>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Prefilled: Story = {
  args: { defaultValue: "@Priya Sharma the draft reply is ready for approval." },
};
export const Disabled: Story = {
  args: { disabled: true, placeholder: "You can't comment on a closed case." },
};
