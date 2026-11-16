import { ExposureIcon, HearingIcon, OverdueIcon, ProofIcon } from "@dueproof/icons";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Row } from "../../stories/helpers";
import { Amount } from "../Amount/Amount";
import { Button } from "../Button/Button";
import { Card, Sparkline, StatCard } from "./Card";

const meta = {
  title: "Structure/Card",
  component: Card,
} satisfies Meta<typeof Card>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: "var(--dp-space-16)",
      }}
    >
      <Card
        title="Due this week"
        description="5 deadlines across 4 clients"
        actions={
          <Button size="sm" variant="plain">
            See all
          </Button>
        }
      >
        <p style={{ margin: 0 }}>Card content</p>
      </Card>
      <Card variant="outline" title="Outline">
        <p style={{ margin: 0 }}>For grouping inside a surface.</p>
      </Card>
      <Card variant="sunken" title="Sunken" footer="Updated 5 min ago">
        <p style={{ margin: 0 }}>For secondary panels.</p>
      </Card>
    </div>
  ),
};

export const Stats: StoryObj<typeof StatCard> = {
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: "var(--dp-space-12)",
      }}
    >
      <StatCard
        label="Overdue"
        icon={OverdueIcon}
        value="3"
        tone="attention"
        delta={{ value: "+1", direction: "up", tone: "negative", period: "since Friday" }}
        onSelect={() => {}}
      />
      <StatCard
        label="Needs review"
        icon={ProofIcon}
        value="12"
        footnote="4 unlocated, 8 below the bar"
      />
      <StatCard label="Hearings this week" icon={HearingIcon} value="2" />
      <StatCard
        label="Open demand"
        icon={ExposureIcon}
        value={<Amount minor={166_04_90_000} compact size="xl" />}
        delta={{
          value: "+₹12.4 lakh",
          direction: "up",
          tone: "negative",
          period: "since last month",
        }}
        sparkline={<Sparkline values={[12.1, 12.4, 13.0, 14.8, 15.2, 16.6]} tone="danger" />}
        href="#exposure"
      />
    </div>
  ),
};

export const Sparklines: StoryObj<typeof Sparkline> = {
  render: () => (
    <Row>
      {(["accent", "neutral", "danger", "success"] as const).map((t) => (
        <div key={t} style={{ width: "8rem", height: "2rem" }}>
          <Sparkline values={[3, 5, 4, 8, 6, 9, 7]} tone={t} label={`Trend, ${t}`} />
        </div>
      ))}
    </Row>
  ),
};
