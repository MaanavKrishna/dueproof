import { FilterIcon, MoreIcon, SearchIcon, SettingsIcon, TrashIcon } from "@dueproof/icons";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Row, Section } from "../../stories/helpers";
import { IconButton } from "./IconButton";

const meta = {
  title: "Actions/IconButton",
  component: IconButton,
  args: { icon: MoreIcon, label: "More actions" },
} satisfies Meta<typeof IconButton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const AllStates: Story = {
  render: () => (
    <>
      <Section title="Variants">
        <Row>
          <IconButton icon={SearchIcon} label="Search" shortcut="⌘K" />
          <IconButton icon={FilterIcon} label="Filter" variant="secondary" />
          <IconButton icon={SettingsIcon} label="Settings" variant="tertiary" />
          <IconButton icon={TrashIcon} label="Delete" variant="destructive" />
        </Row>
      </Section>
      <Section title="Sizes, loading, disabled">
        <Row>
          <IconButton icon={MoreIcon} label="More" size="sm" />
          <IconButton icon={MoreIcon} label="More" size="md" />
          <IconButton icon={MoreIcon} label="More" size="lg" />
          <IconButton icon={MoreIcon} label="More" loading />
          <IconButton icon={MoreIcon} label="More" disabled />
        </Row>
      </Section>
    </>
  ),
};
