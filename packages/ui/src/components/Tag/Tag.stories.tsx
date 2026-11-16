import { ClientIcon } from "@dueproof/icons";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Row } from "../../stories/helpers";
import { Tag } from "./Tag";

const meta = {
  title: "Status/Tag",
  component: Tag,
  args: { label: "Delhi branch" },
} satisfies Meta<typeof Tag>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

function Removable() {
  const [tags, setTags] = useState(["GST", "FY 2024–25", "Delhi", "High value"]);
  return (
    <Row gap={8}>
      {tags.map((t) => (
        <Tag key={t} label={t} onRemove={() => setTags(tags.filter((x) => x !== t))} />
      ))}
    </Row>
  );
}

export const AllStates: Story = {
  render: () => (
    <Row>
      <Tag label="Static" />
      <Tag label="With icon" icon={ClientIcon} />
      <Tag label="Small" size="sm" />
      <Removable />
    </Row>
  ),
};
