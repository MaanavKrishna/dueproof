import { OverdueIcon, ProofIcon, TodayIcon, WeekIcon } from "@dueproof/icons";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { Button } from "../components/Button/Button";
import { Card, StatCard } from "../components/Card/Card";
import { Grid } from "../components/Grid/Grid";
import { SettingsRow, SettingsSection } from "../components/SettingsLayout/SettingsLayout";
import { TextField } from "../components/TextField/TextField";
import { ListPageTemplate } from "../templates/ListPageTemplate";
import type { PageWidth } from "../templates/page";
import { SettingsPageTemplate } from "../templates/SettingsPageTemplate";

/**
 * The layout rules (packages/ui README, "Layout"), shown at several widths.
 * Each frame is a fixed width so the stories compare side by side; grids and
 * page widths respond to their column, not the window, so a frame behaves
 * like a screen of that width (only the gutter follows the window).
 */
const meta = {
  title: "Foundations/Layout",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const WIDTHS = [390, 768, 1280, 1920] as const;

function Frame({ width, children }: { width: number; children: ReactNode }) {
  return (
    <figure
      style={{ margin: 0, display: "flex", flexDirection: "column", gap: "var(--dp-space-8)" }}
    >
      <figcaption style={{ font: "var(--dp-text-footnote-font)", color: "var(--dp-fg-secondary)" }}>
        {width} wide
      </figcaption>
      <div
        style={{
          width: `${width / 16}rem`,
          maxWidth: "100%",
          height: "calc(var(--dp-space-96) * 6)",
          overflow: "auto",
          background: "var(--dp-bg-canvas)",
          boxShadow: "inset 0 0 0 var(--dp-border-hairline) var(--dp-separator-default)",
        }}
      >
        {children}
      </div>
    </figure>
  );
}

function Frames({ render }: { render: (width: number) => ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--dp-space-32)",
        padding: "var(--dp-space-24)",
        overflowX: "auto",
      }}
    >
      {WIDTHS.map((w) => (
        <Frame key={w} width={w}>
          {render(w)}
        </Frame>
      ))}
    </div>
  );
}

const panels = [
  "Overdue",
  "Due today",
  "This week",
  "Hearings",
  "Needs review",
  "Recently received",
  "Awaiting approval",
];

function Dashboard() {
  return (
    <ListPageTemplate
      title="Today"
      subtitle="18 Nov 2026 · 5 overdue"
      scrollPage
      summary={
        <>
          <StatCard label="Overdue" icon={OverdueIcon} value="5" tone="attention" />
          <StatCard label="Due this week" icon={WeekIcon} value="3" />
          <StatCard label="To review" icon={ProofIcon} value="12" />
          <StatCard label="Hearings" icon={TodayIcon} value="1" />
        </>
      }
    >
      <Grid min="panel" maxColumns={4}>
        {panels.map((p) => (
          <Card key={p} title={p} headingLevel={2}>
            Nothing here yet.
          </Card>
        ))}
      </Grid>
    </ListPageTemplate>
  );
}

/**
 * Today at four widths: the numbers and the panels share the page's edges,
 * and a short last row of panels fills the width instead of stranding one.
 */
export const DashboardGrid: Story = {
  name: "Dashboard (full width)",
  render: () => <Frames render={() => <Dashboard />} />,
};

/** The grid alone: stat, card and panel sizes, with seven items each. */
export const GridSizes: Story = {
  name: "Grid sizes",
  render: () => (
    <Frames
      render={() => (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--dp-space-24)",
            padding: "var(--dp-space-16)",
          }}
        >
          {(["stat", "card", "panel"] as const).map((size) => (
            <Grid key={size} min={size} maxColumns={size === "stat" ? 4 : 5}>
              {panels.map((p) => (
                <Card key={p} variant="outline" padding="sm">
                  {p}
                </Card>
              ))}
            </Grid>
          ))}
        </div>
      )}
    />
  ),
};

function Widths({ width }: { width: PageWidth }) {
  return (
    <ListPageTemplate
      title={`Page width: ${width}`}
      subtitle="The title and content share a left edge"
      width={width}
      scrollPage
    >
      <Card title="Content" headingLevel={2}>
        The content spans the page column. Above its limit the column centres, title and all.
      </Card>
    </ListPageTemplate>
  );
}

/** The four page widths in a 1920 frame. */
export const PageWidths: Story = {
  name: "Page widths",
  render: () => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--dp-space-32)",
        padding: "var(--dp-space-24)",
        overflowX: "auto",
      }}
    >
      {(["full", "wide", "readable", "narrow"] as const).map((w) => (
        <Frame key={w} width={1920}>
          <Widths width={w} />
        </Frame>
      ))}
    </div>
  ),
};

/** Settings at four widths: navigation and forms centre together at the readable width. */
export const Settings: Story = {
  name: "Settings (readable)",
  render: () => (
    <Frames
      render={() => (
        <SettingsPageTemplate
          title="Settings"
          sections={[
            { id: "me", label: "Me" },
            { id: "org", label: "Organisation" },
            { id: "team", label: "Team & access" },
          ]}
          activeSection="me"
        >
          <SettingsSection title="Profile" actions={<Button size="sm">Change photo</Button>}>
            <SettingsRow label="Name" stacked>
              <TextField label="Name" hideLabel defaultValue="Asha Rao" />
            </SettingsRow>
          </SettingsSection>
        </SettingsPageTemplate>
      )}
    />
  ),
};
