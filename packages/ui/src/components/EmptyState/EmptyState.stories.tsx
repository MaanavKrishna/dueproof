import { InboxIcon, NoticeIcon, SearchIcon, UploadIcon } from "@dueproof/icons";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card, Stack } from "../../stories/helpers";
import { Button } from "../Button/Button";
import { EmptyState } from "./EmptyState";

const meta = {
  title: "Content/EmptyState",
  component: EmptyState,
  args: {
    title: "No notices yet",
    description: "Upload a notice and we'll find what's owed and by when.",
  },
} satisfies Meta<typeof EmptyState>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const AllStates: Story = {
  render: () => (
    <Stack gap={32}>
      <EmptyState
        size="hero"
        icon={NoticeIcon}
        title="Every notice, every date, with proof."
        description="Upload your first notice. We'll read it, find the deadlines and show you where each one is on the page."
        actions={
          <>
            <Button variant="primary" size="lg" icon={UploadIcon}>
              Upload a notice
            </Button>
            <Button size="lg">Try a sample</Button>
          </>
        }
      />
      <EmptyState
        icon={InboxIcon}
        title="Nothing due this week"
        description="Next deadline: 2 Dec 2026."
      />
      <Card>
        <EmptyState
          size="compact"
          icon={SearchIcon}
          title="No matches"
          description="Try a GSTIN, PAN or reference number."
          headingLevel={3}
        />
      </Card>
    </Stack>
  ),
};
