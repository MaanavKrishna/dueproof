import { AiSuggestedIcon } from "@dueproof/icons";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Row, Section } from "../../stories/helpers";
import { Badge, type Tone } from "./Badge";

const meta = {
  title: "Status/Badge",
  component: Badge,
  args: { children: "12", tone: "accent" },
} satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

const tones: Tone[] = ["neutral", "accent", "danger", "warning", "success", "info"];

export const AllStates: Story = {
  render: () => (
    <>
      {(["soft", "solid", "outline"] as const).map((variant) => (
        <Section key={variant} title={variant}>
          <Row>
            {tones.map((t) => (
              <Badge key={t} tone={t} variant={variant}>
                {t}
              </Badge>
            ))}
            <Badge tone="danger" variant={variant}>
              3
            </Badge>
            <Badge tone="info" variant={variant} icon={AiSuggestedIcon}>
              Suggested
            </Badge>
            <Badge tone="neutral" variant={variant} size="sm">
              sm
            </Badge>
          </Row>
        </Section>
      ))}
    </>
  ),
};
