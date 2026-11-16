import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "../../stories/helpers";
import { SearchField } from "./SearchField";

const meta = {
  title: "Forms/SearchField",
  component: SearchField,
  args: { label: "Search notices", placeholder: "Search notices, clients, GSTIN" },
} satisfies Meta<typeof SearchField>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const AllStates: Story = {
  render: () => (
    <Stack width="420px">
      <SearchField label="Search" shortcut={["mod", "K"]} />
      <SearchField label="Search" defaultValue="ASMT-10" />
      <SearchField label="Search" size="sm" />
      <SearchField label="Search" disabled />
    </Stack>
  ),
};
