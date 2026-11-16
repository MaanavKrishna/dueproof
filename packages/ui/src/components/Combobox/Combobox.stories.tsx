import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "../../stories/helpers";
import { Combobox } from "./Combobox";

const clients = [
  { value: "arora", label: "Arora Textiles Pvt Ltd", description: "07AAACA1234F1Z5" },
  { value: "bharat", label: "Bharat Steel Industries", description: "27AAACB9876K1Z2" },
  { value: "chennai", label: "Chennai Port Logistics", description: "33AAACC5555L1Z9" },
  { value: "deccan", label: "Deccan Agro Foods", description: "36AAACD1111M1Z4", disabled: true },
  { value: "kerala", label: "Kerala Spices Export House", description: "32AAACK2222N1Z7" },
];

const meta = {
  title: "Forms/Combobox",
  component: Combobox,
  args: { label: "Client", options: clients, placeholder: "Search by name or GSTIN" },
} satisfies Meta<typeof Combobox>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const AllStates: Story = {
  render: () => (
    <Stack width="380px">
      <Combobox label="Client" options={clients} placeholder="Search by name or GSTIN" />
      <Combobox label="Client (chosen)" options={clients} defaultValue="bharat" />
      <Combobox
        label="Client (error)"
        options={clients}
        error="Pick the client this notice is for."
      />
      <Combobox label="Client (locked)" options={clients} disabled defaultValue="kerala" />
    </Stack>
  ),
};
