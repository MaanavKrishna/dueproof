import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card, Stack } from "../../stories/helpers";
import { Skeleton, SkeletonText } from "./Skeleton";

const meta = {
  title: "Feedback/Skeleton",
  component: Skeleton,
} satisfies Meta<typeof Skeleton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  render: () => (
    <div aria-busy="true" style={{ maxWidth: "480px" }}>
      <Card>
        <Stack gap={12}>
          <div style={{ display: "flex", gap: "var(--dp-space-12)", alignItems: "center" }}>
            <Skeleton shape="circle" />
            <Skeleton width="40%" />
          </div>
          <SkeletonText lines={3} />
          <Skeleton shape="rect" />
        </Stack>
      </Card>
    </div>
  ),
};
