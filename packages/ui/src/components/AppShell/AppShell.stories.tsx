import { UploadIcon } from "@dueproof/icons";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { navSections } from "../../stories/fixtures";
import { DemoShell, mobileNav, SidebarFooter, Wordmark } from "../../stories/shell";
import { Banner } from "../Banner/Banner";
import { Button } from "../Button/Button";
import { SidebarNav } from "../SidebarNav/SidebarNav";
import { Toolbar } from "../Toolbar/Toolbar";
import { AppShell } from "./AppShell";
import { SplitView } from "./SplitView";

const meta = {
  title: "Structure/AppShell",
  component: AppShell,
  parameters: { layout: "fullscreen" },
  args: { sidebar: null, children: null },
} satisfies Meta<typeof AppShell>;
export default meta;
type Story = StoryObj<typeof meta>;

function Placeholder() {
  return (
    <div style={{ padding: "0 var(--dp-space-24) var(--dp-space-48)" }}>
      {Array.from({ length: 30 }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static filler
        <p key={i} style={{ color: "var(--dp-fg-secondary)" }}>
          Content row {i + 1}. Scroll to see the large title collapse into the bar.
        </p>
      ))}
    </div>
  );
}

function Page({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <Toolbar
        title={title}
        subtitle={subtitle}
        actions={
          <Button variant="primary" icon={UploadIcon}>
            Upload notice
          </Button>
        }
      />
      <Placeholder />
    </div>
  );
}

export const Default: Story = {
  render: () => (
    <DemoShell active="today">
      <Page
        title="Good morning, Priya"
        subtitle="Monday 16 Nov 2026 · 3 overdue, 5 due this week, 12 to review"
      />
    </DemoShell>
  ),
};

export const CollapsedSidebar: Story = {
  render: () => (
    <DemoShell active="notices" collapsed>
      <Page title="Notices" subtitle="142 open · 9 overdue" />
    </DemoShell>
  ),
};

export const OfflineBanner: Story = {
  render: () => (
    <DemoShell
      active="inbox"
      banner={
        <Banner tone="warning" variant="strip" title="You're offline.">
          Showing what's loaded. Changes are blocked until you reconnect.
        </Banner>
      }
    >
      <Page title="Inbox" />
    </DemoShell>
  ),
};

export const WithInspector: Story = {
  render: function Render() {
    const [open, setOpen] = useState(true);
    return (
      <AppShell
        sidebar={
          <SidebarNav
            sections={navSections()}
            activeId="inbox"
            header={<Wordmark />}
            footer={<SidebarFooter />}
          />
        }
        mobileNav={mobileNav}
        inspector={<p style={{ padding: "var(--dp-space-16)" }}>Record details go here.</p>}
        inspectorTitle="ASMT-10 · Harbour Valley Foods"
        inspectorOpen={open}
        onInspectorOpenChange={setOpen}
      >
        <div style={{ height: "100%", overflow: "auto" }}>
          <Toolbar
            title="Inbox"
            actions={<Button onClick={() => setOpen(!open)}>Toggle inspector</Button>}
          />
          <Placeholder />
        </div>
      </AppShell>
    );
  },
};

export const SplitViewOverlay: Story = {
  render: () => (
    <div style={{ height: "70vh", maxWidth: "60rem" }}>
      <SplitView
        inspector={
          <p style={{ padding: "var(--dp-space-16)" }}>Below 1280 px the inspector floats.</p>
        }
        inspectorTitle="Inspector"
        onInspectorOpenChange={() => {}}
      >
        <Placeholder />
      </SplitView>
    </div>
  ),
};
