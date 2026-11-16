import { OfflineIcon } from "@dueproof/icons";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "../../stories/helpers";
import { Button } from "../Button/Button";
import { Banner } from "./Banner";

const meta = {
  title: "Feedback/Banner",
  component: Banner,
  args: {
    tone: "info",
    title: "Translated from Malayalam",
    children: "Read the original before you rely on a date.",
  },
} satisfies Meta<typeof Banner>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const AllStates: Story = {
  render: () => (
    <Stack width="720px">
      <Banner
        tone="info"
        title="Translated from Malayalam"
        actions={<Button size="sm">Show original</Button>}
      >
        Read the original before you rely on a date.
      </Banner>
      <Banner tone="success" title="All findings verified" onDismiss={() => {}} />
      <Banner tone="warning" title="Date not found on the page">
        Confirm the reply date before it becomes a deadline.
      </Banner>
      <Banner tone="danger" title="Couldn't read page 3" actions={<Button size="sm">Retry</Button>}>
        The scan is too dark. Upload a clearer copy.
      </Banner>
      <Banner
        tone="neutral"
        variant="strip"
        icon={OfflineIcon}
        title="You're offline. Changes will sync when you reconnect."
      />
    </Stack>
  ),
};
