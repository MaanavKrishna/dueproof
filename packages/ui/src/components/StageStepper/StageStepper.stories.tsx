import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { type CaseStage, StageStepper } from "./StageStepper";

const meta = {
  title: "Structure/StageStepper",
  component: StageStepper,
  args: { current: "drafting" },
} satisfies Meta<typeof StageStepper>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Drafting: Story = {
  args: { details: { received: "21 Oct", gathering: "2 Nov", drafting: "Ananya Iyer" } },
};
export const Received: Story = { args: { current: "received" } };
export const FiledWithArn: Story = {
  args: { current: "filed", details: { filed: "ARN AA2711260045678" } },
};
export const ClosedWithoutAppeal: Story = {
  args: { current: "closed", skipped: ["appeal"] },
};
export const Compact: Story = { args: { current: "approval", size: "compact" } };
export const Interactive: Story = {
  render: function Render() {
    const [stage, setStage] = useState<CaseStage>("gathering");
    return <StageStepper current={stage} onStageSelect={setStage} />;
  },
};
