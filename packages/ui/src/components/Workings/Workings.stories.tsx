import type { Meta, StoryObj } from "@storybook/react-vite";
import { Amount } from "../Amount/Amount";
import { Workings } from "./Workings";

const meta = {
  title: "Dueproof/Workings",
  component: Workings,
  args: {
    title: "Interest on excess ITC to 16 Nov 2026",
    rateSource: "Rate from the India pack (GST s. 50(3)), last checked 1 Oct 2026 — verify.",
    onEditInputs: () => {},
    steps: [
      {
        id: "s1",
        label: "Excess ITC availed",
        inputs: [
          {
            label: "ITC in GSTR-3B minus GSTR-2B",
            value: <Amount minor={31840000} />,
            source: "From the notice, page 1",
          },
        ],
        result: <Amount minor={31840000} />,
      },
      {
        id: "s2",
        label: "Interest under section 50(3)",
        formula: "ITC × 18% × days ÷ 365",
        inputs: [
          { label: "Rate", value: "18% a year", source: "India pack" },
          { label: "From", value: "20 May 2025", source: "Due date of GSTR-3B (Apr 2025)" },
          { label: "To", value: "16 Nov 2026", source: "Chosen date" },
          { label: "Days", value: "545" },
        ],
        result: <Amount minor={8557150} estimate />,
        note: "Assumes the ITC was used. If it wasn't, no interest is payable.",
      },
    ],
    total: { label: "Interest to date", value: <Amount minor={8557150} size="lg" estimate /> },
  },
} satisfies Meta<typeof Workings>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Interest: Story = {};

export const PenaltyRange: Story = {
  args: {
    title: "Penalty under section 73(9)",
    steps: [
      {
        id: "p1",
        label: "Lowest",
        formula: "greater of ₹10,000 or 10% of tax",
        inputs: [{ label: "Tax", value: <Amount minor={45230000} /> }],
        result: <Amount minor={4523000} estimate />,
      },
      {
        id: "p2",
        label: "Highest",
        formula: "100% of tax if fraud is shown (s. 74)",
        result: <Amount minor={45230000} estimate />,
      },
    ],
    total: {
      label: "Penalty range",
      value: <Amount minor={4523000} to={45230000} estimate compact size="lg" />,
    },
  },
};
