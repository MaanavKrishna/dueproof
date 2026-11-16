import { SearchIcon, UserIcon } from "@dueproof/icons";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "../../stories/helpers";
import { Kbd } from "../Kbd/Kbd";
import { TextArea } from "../TextArea/TextArea";
import { TextField } from "./TextField";

const meta = {
  title: "Forms/TextField",
  component: TextField,
  args: { label: "GSTIN", placeholder: "07AAACA1234F1Z5" },
} satisfies Meta<typeof TextField>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const AllStates: Story = {
  render: () => (
    <Stack width="420px">
      <TextField label="Client name" placeholder="Arora Textiles Pvt Ltd" />
      <TextField
        label="PAN"
        description="10 characters, as on the PAN card."
        defaultValue="AAACA1234F"
      />
      <TextField
        label="GSTIN"
        error="A GSTIN has 15 characters. This one has 13."
        defaultValue="07AAACA1234F1"
      />
      <TextField label="Assigned to" icon={UserIcon} optional placeholder="Anyone" />
      <TextField
        label="Find"
        icon={SearchIcon}
        trailing={<Kbd keys={["mod", "K"]} />}
        hideLabel
        placeholder="Find"
      />
      <TextField label="Reference" disabled defaultValue="ZD0711240012345" />
      <TextField label="Small" size="sm" placeholder="Small" />
      <TextField label="Large" size="lg" placeholder="Large" />
    </Stack>
  ),
};

/** TextArea shares the field anatomy. */
export const TextAreas: Story = {
  render: () => (
    <Stack width="480px">
      <TextArea label="Reply draft" description="Grows as you type." />
      <TextArea label="Reason for correction" error="Say why the date changed." />
      <TextArea label="Locked" disabled defaultValue="Approved by R. Mehta on 12 Nov 2026." />
    </Stack>
  ),
};
