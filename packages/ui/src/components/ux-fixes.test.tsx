/**
 * Fixes from the UX review that live in components: the case header's
 * heading when no reference was read (M7), the sidebar on cramped screens
 * (M12), and the stage steps' names on hover and focus (M13).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppShell, Button, UIProvider, useAppShell } from "../index";
import { NoticeHeader } from "./NoticeHeader/NoticeHeader";
import { StageStepper } from "./StageStepper/StageStepper";

const base = {
  authority: "gst" as const,
  type: "GST · ASMT-10",
  issuingOffice: "CGST Range IV",
  received: "24 Oct 2026",
  client: { name: "Harbour Valley Foods" },
  stage: "received" as const,
};

function Toggle() {
  const { toggleSidebar } = useAppShell();
  return <Button onClick={toggleSidebar}>Toggle</Button>;
}

describe("AppShell on narrow or short screens (M12)", () => {
  it("folds the sidebar to its icon rail, and the toggle still opens it", async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) =>
      ({
        matches: query.includes("60rem"),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList) as typeof window.matchMedia;
    try {
      const user = userEvent.setup();
      const { container } = render(
        <AppShell sidebar={<nav>Side</nav>}>
          <Toggle />
        </AppShell>,
      );
      const shell = container.firstElementChild as HTMLElement;
      expect(shell).toHaveAttribute("data-sidebar", "collapsed");
      await user.click(screen.getByRole("button", { name: "Toggle" }));
      expect(shell).toHaveAttribute("data-sidebar", "expanded");
    } finally {
      window.matchMedia = original;
    }
  });
});

describe("StageStepper (M13)", () => {
  it("names an icon-only step in a tooltip on focus", async () => {
    const user = userEvent.setup();
    render(
      <UIProvider>
        <StageStepper current="drafting" size="compact" onStageSelect={() => {}} />
      </UIProvider>,
    );
    await user.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Received");
  });
});

describe("NoticeHeader (M7)", () => {
  it("uses the reference as the heading when one was read", () => {
    render(<NoticeHeader {...base} reference="ZD2710240012345" title="Scrutiny" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("ZD2710240012345");
    expect(screen.queryByText("Not found on the notice")).not.toBeInTheDocument();
  });

  it("uses the title when no reference was read, and says so as a fact", () => {
    render(<NoticeHeader {...base} reference={null} title="Fire safety audit" />);
    expect(screen.getByRole("heading", { level: 1, name: "Fire safety audit" })).toBeVisible();
    expect(screen.getByText("Not found on the notice")).toBeInTheDocument();
    expect(screen.queryByText(/No reference read/)).not.toBeInTheDocument();
  });
});
