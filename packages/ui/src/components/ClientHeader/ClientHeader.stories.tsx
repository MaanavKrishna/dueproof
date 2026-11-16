import type { Meta, StoryObj } from "@storybook/react-vite";
import { harbour } from "../../stories/fixtures";
import { Avatar, AvatarStack } from "../Avatar/Avatar";
import { Button } from "../Button/Button";
import { Tag } from "../Tag/Tag";
import { ClientHeader } from "./ClientHeader";

const meta = {
  title: "Dueproof/ClientHeader",
  component: ClientHeader,
  args: {
    name: harbour.name,
    subtitle: "Private limited company · Mumbai · FY Apr–Mar",
    identifiers: [
      { type: "GSTIN", value: harbour.gstin, note: "Maharashtra · monthly" },
      { type: "PAN", value: harbour.pan },
      { type: "CIN", value: harbour.cin ?? "" },
      { type: "TAN", value: harbour.tan ?? "" },
    ],
    badges: <Tag label="Key client" size="sm" />,
    actions: <Button>Edit client</Button>,
    people: (
      <AvatarStack size="xs">
        <Avatar name="Priya Sharma" />
        <Avatar name="Rahul Mehta" />
      </AvatarStack>
    ),
  },
} satisfies Meta<typeof ClientHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const FormatProblems: Story = {
  args: {
    name: "Kaveri Agro Exports",
    subtitle: "Partnership firm · Coimbatore",
    identifiers: [
      { type: "GSTIN", value: "33AAJFK3456Q1Z0" },
      { type: "PAN", value: "AAJFK3456" },
      { type: "TAN", value: "CHEK1234X" },
    ],
    badges: undefined,
    people: undefined,
  },
};
