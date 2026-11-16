import type { Meta, StoryObj } from "@storybook/react-vite";
import { activity, people } from "../../stories/fixtures";
import { CommentComposer } from "../CommentComposer/CommentComposer";
import { ActivityFeed } from "./ActivityFeed";

const meta: Meta<typeof ActivityFeed> = {
  title: "Dueproof/ActivityFeed",
  component: ActivityFeed,
  args: {
    items: activity,
    composer: (
      <CommentComposer
        users={people}
        onSubmit={() => {}}
        author={{ id: "u1", name: "Priya Sharma" }}
      />
    ),
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: "40rem" }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ActivityFeed>;

export const Conversation: Story = {};
export const NewestFirst: Story = {
  render: () => <ActivityFeed items={activity} order="newest" filter={false} title="History" />,
};
export const Empty: Story = { args: { items: [] } };
