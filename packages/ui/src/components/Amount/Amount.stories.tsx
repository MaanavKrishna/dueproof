import type { Meta, StoryObj } from "@storybook/react-vite";
import { Row, Section, Stack } from "../../stories/helpers";
import { Amount } from "./Amount";

const meta = {
  title: "Dueproof/Amount",
  component: Amount,
  args: { minor: 45230000 },
} satisfies Meta<typeof Amount>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Compact: Story = { args: { compact: true } };
export const Estimate: Story = { args: { minor: 2190000, estimate: true } };
export const PenaltyRange: Story = { args: { minor: 1000000, to: 4523000, estimate: true } };

export const AllForms: Story = {
  render: () => (
    <>
      <Section title="Indian grouping">
        <Stack gap={8}>
          <Amount minor={45230000} />
          <Amount minor={45230050} />
          <Amount minor={12_84_00_00_000} />
          <Amount minor={9900} />
        </Stack>
      </Section>
      <Section title="Lakh and crore">
        <Row>
          <Amount minor={45230000} compact />
          <Amount minor={1_20_00_00_000} compact />
          <Amount minor={9_50_000_00} compact />
        </Row>
      </Section>
      <Section title="Sizes and tones">
        <Row>
          <Amount minor={45230000} size="sm" />
          <Amount minor={45230000} size="md" />
          <Amount minor={45230000} size="lg" />
          <Amount minor={45230000} size="xl" />
        </Row>
        <Row>
          <Amount minor={45230000} tone="danger" />
          <Amount minor={45230000} tone="muted" struck />
          <Amount minor={45230000} tone="positive" />
        </Row>
      </Section>
      <Section title="Estimates never look like quoted amounts">
        <Row>
          <Amount minor={45230000} size="lg" />
          <Amount minor={2190000} size="lg" estimate />
          <Amount minor={1000000} to={4523000} size="lg" estimate compact />
        </Row>
      </Section>
    </>
  ),
};
