import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "../../stories/helpers";
import { Link } from "./Link";

const meta = {
  title: "Actions/Link",
  component: Link,
  args: { href: "#", children: "View the notice" },
} satisfies Meta<typeof Link>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const AllStates: Story = {
  render: () => (
    <Stack>
      <p>
        Reply due 20 Nov 2026 — 30 days from receipt. <Link href="#">Show the workings</Link>.
      </p>
      <p>
        Read{" "}
        <Link href="https://www.gst.gov.in" external>
          section 73 on the GST portal
        </Link>
        .
      </p>
      <p style={{ color: "var(--dp-fg-secondary)" }}>
        Subtle:{" "}
        <Link href="#" variant="subtle">
          Arora Textiles
        </Link>
      </p>
    </Stack>
  ),
};
