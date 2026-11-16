import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import {
  asmt10Findings,
  asmt10Highlights,
  asmt10Pages,
  asmt10PagesHindi,
} from "../../stories/fixtures";
import { Row } from "../../stories/helpers";
import { FindingCard } from "../FindingCard/FindingCard";
import { GradeBadge } from "./grades";
import { ProofViewer } from "./ProofViewer";

const meta: Meta<typeof ProofViewer> = {
  title: "Dueproof/ProofViewer",
  component: ProofViewer,
  args: {
    title: "ASMT-10 · Harbour Valley Foods",
    pages: asmt10Pages,
    highlights: asmt10Highlights,
  },
  decorators: [
    (Story) => (
      <div style={{ height: "48rem" }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ProofViewer>;

export const Default: Story = { args: { defaultActiveHighlightId: "h-due" } };

export const FitPage: Story = { args: { defaultZoom: "fit-page" } };

export const Zoomed: Story = { args: { defaultZoom: 2, defaultActiveHighlightId: "h-amount" } };

/** Page 2 is a 150 dpi scan: its highlights are in pixels. */
export const ScannedPagePixels: Story = {
  args: { defaultPage: 2, defaultActiveHighlightId: "h-hearing" },
};

export const HighlightList: Story = { args: { defaultShowList: true } };

export const OriginalAndTranslation: Story = {
  args: {
    pages: asmt10PagesHindi,
    languages: { original: "Hindi", translation: "English" },
    defaultShowText: true,
    defaultActiveHighlightId: "h-due",
  },
};

export const InNarrowInspector: Story = {
  args: { defaultActiveHighlightId: "h-section" },
  decorators: [
    (Story) => (
      <div style={{ width: "var(--dp-layout-inspector)", height: "100%" }}>
        <Story />
      </div>
    ),
  ],
};

export const ImageFailedToLoad: Story = {
  args: { pages: [{ ...asmt10Pages[0], src: "missing.png" } as (typeof asmt10Pages)[number]] },
};

/** Finding cards drive the viewer: "Page 1" jumps to the highlight, with a pulse. */
export const DrivenByFindings: Story = {
  render: function Render(args) {
    const [active, setActive] = useState<string | null>("h-due");
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr)",
          gap: "var(--dp-space-16)",
          height: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--dp-space-12)",
            overflow: "auto",
          }}
        >
          {asmt10Findings.map((f) => (
            <FindingCard
              key={f.id}
              duty={f.duty}
              {...(f.due ? { due: f.due } : {})}
              basis={f.basis}
              {...(f.owner ? { owner: f.owner } : {})}
              status={f.status}
              origin={f.origin}
              verification={f.verification}
              grade={f.grade}
              sourceLabel={
                f.verification.page ? `Page ${f.verification.page}` : "Expected on page 1"
              }
              selected={active === f.highlightId}
              onShowSource={() => setActive(f.highlightId)}
              needsReview={f.needsReview ?? false}
              reviewReason={f.reviewReason}
              onConfirm={() => {}}
              onEdit={() => {}}
              onDismiss={() => {}}
            />
          ))}
        </div>
        <ProofViewer {...args} activeHighlightId={active} onActiveHighlightChange={setActive} />
      </div>
    );
  },
};

export const Grades: StoryObj<typeof GradeBadge> = {
  render: () => (
    <Row>
      <GradeBadge grade="exact" />
      <GradeBadge grade="strong" />
      <GradeBadge grade="approximate" />
      <GradeBadge grade="unlocated" />
      <GradeBadge grade="exact" size="sm" />
      <GradeBadge grade="approximate" iconOnly />
    </Row>
  ),
};
