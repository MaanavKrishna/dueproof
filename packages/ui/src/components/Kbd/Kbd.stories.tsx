import type { Meta, StoryObj } from "@storybook/react-vite";
import { Row } from "../../stories/helpers";
import { Kbd } from "./Kbd";

const meta = {
  title: "Content/Kbd",
  component: Kbd,
} satisfies Meta<typeof Kbd>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  render: () => (
    <Row gap={24}>
      <Kbd>Esc</Kbd>
      <Kbd keys={["mod", "K"]} />
      <Kbd keys={["mod", "K"]} platform="apple" />
      <Kbd keys={["mod", "shift", "P"]} platform="other" />
      <Kbd keys={["G", "T"]} />
    </Row>
  ),
};
