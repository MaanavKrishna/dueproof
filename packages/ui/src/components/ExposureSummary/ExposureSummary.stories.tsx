import type { Meta, StoryObj } from "@storybook/react-vite";
import { exposure } from "../../stories/fixtures";
import { ExposureSummary } from "./ExposureSummary";

const meta = {
  title: "Dueproof/ExposureSummary",
  component: ExposureSummary,
  args: { rows: exposure, asOf: "16 Nov 2026", onRowSelect: () => {} },
} satisfies Meta<typeof ExposureSummary>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ByClient: Story = {};
export const FullFigures: Story = { args: { compact: false, rows: exposure.slice(0, 2) } };
export const ByTaxType: Story = {
  args: {
    title: "Exposure by tax",
    rowHeader: "Tax",
    rows: [
      {
        id: "gst",
        label: "GST",
        sublabel: "6 notices",
        tax: 1_34_80_00_000,
        interest: 9_89_10_000,
        penalty: { min: 13_14_00_000, max: 1_34_80_00_000 },
      },
      {
        id: "it",
        label: "Income tax",
        sublabel: "1 notice",
        tax: 31_25_00_000,
        interest: 3_02_00_000,
        penalty: { min: 0, max: 6_25_00_000 },
      },
    ],
  },
};
