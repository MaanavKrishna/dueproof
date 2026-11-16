import type { Meta, StoryObj } from "@storybook/react-vite";
import { Row, Section } from "../../stories/helpers";
import { Avatar, AvatarStack } from "./Avatar";

const meta = {
  title: "Status/Avatar",
  component: Avatar,
  args: { name: "Riya Mehta" },
} satisfies Meta<typeof Avatar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const AllStates: Story = {
  render: () => (
    <>
      <Section title="Sizes">
        <Row>
          {(["xs", "sm", "md", "lg", "xl"] as const).map((s) => (
            <Avatar key={s} name="Riya Mehta" size={s} />
          ))}
        </Row>
      </Section>
      <Section title="Tints and shapes">
        <Row>
          {["Arjun Iyer", "Fatima Shaikh", "Gurpreet Singh", "Lakshmi Nair", "Sanjay Rao"].map(
            (n) => (
              <Avatar key={n} name={n} />
            ),
          )}
          <Avatar name="Arora Textiles" shape="square" />
          <Avatar name="Broken image" src="/missing.png" />
        </Row>
      </Section>
      <Section title="Stack">
        <AvatarStack max={3}>
          <Avatar name="Riya Mehta" />
          <Avatar name="Arjun Iyer" />
          <Avatar name="Fatima Shaikh" />
          <Avatar name="Gurpreet Singh" />
          <Avatar name="Lakshmi Nair" />
        </AvatarStack>
      </Section>
    </>
  ),
};
