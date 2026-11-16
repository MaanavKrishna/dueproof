import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { FindingCard } from "../FindingCard/FindingCard";
import { type ProofHighlight, type ProofPage, ProofViewer } from "./ProofViewer";

const pages: ProofPage[] = [
  {
    number: 1,
    src: "page-1.png",
    width: 595,
    height: 842,
    unit: "pt",
    text: "You are required to reply within 30 days of receipt of this notice.",
  },
  { number: 2, src: "page-2.png", width: 1240, height: 1754, unit: "px", text: "Tax ₹4,52,300." },
];

const highlights: ProofHighlight[] = [
  {
    id: "due",
    page: 1,
    rects: [[72, 300, 520, 316]],
    label: "reply due 20 Nov 2026",
    quote: "reply within 30 days",
    grade: "exact",
  },
  {
    id: "amount",
    page: 2,
    rects: [
      [100, 400, 600, 430],
      [100, 432, 400, 460],
    ],
    label: "tax demanded ₹4,52,300",
    grade: "approximate",
  },
  { id: "hearing", page: 1, rects: [], label: "personal hearing", grade: "unlocated" },
  { id: "section", page: 1, rects: [[72, 120, 300, 136]], label: "Section 61", grade: "strong" },
];

const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));

function Case() {
  const [active, setActive] = useState<string | null>(null);
  return (
    <>
      <FindingCard
        duty="Reply to the notice"
        origin="rule"
        verification={{ state: "verified", page: 2 }}
        grade="approximate"
        sourceLabel="Page 2"
        onShowSource={() => setActive("amount")}
        selected={active === "amount"}
      />
      <ProofViewer
        title="ASMT-10"
        pages={pages}
        highlights={highlights}
        activeHighlightId={active}
        onActiveHighlightChange={setActive}
      />
    </>
  );
}

describe("ProofViewer", () => {
  it("names every highlight with what it proves, its grade and its page", () => {
    render(<ProofViewer title="ASMT-10" pages={pages} highlights={highlights} />);
    expect(screen.getByRole("region", { name: "Proof viewer: ASMT-10" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Highlighted: reply due 20 Nov 2026, exact match, page 1",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Highlighted: Section 61, strong match, page 1" }),
    ).toBeInTheDocument();
    // Unlocated quotes have no box on the page.
    expect(screen.queryByRole("button", { name: /personal hearing/ })).not.toBeInTheDocument();
  });

  it("scales boxes from the page's own units (points or pixels) to percentages", () => {
    render(<ProofViewer title="ASMT-10" pages={pages} highlights={highlights} defaultPage={2} />);
    const box = screen.getByRole("button", { name: /tax demanded/ });
    const pc = (v: string) => Number.parseFloat(v);
    expect(pc(box.style.left)).toBeCloseTo((100 / 1240) * 100, 3);
    expect(pc(box.style.top)).toBeCloseTo((400 / 1754) * 100, 3);
    expect(pc(box.style.width)).toBeCloseTo((500 / 1240) * 100, 3);
    expect(box.querySelectorAll("span[class*='rect']")).toHaveLength(2);
  });

  it("moves between highlights with N and P across pages, focusing each", async () => {
    const user = userEvent.setup();
    const onActive = vi.fn();
    render(
      <ProofViewer
        title="ASMT-10"
        pages={pages}
        highlights={highlights}
        onActiveHighlightChange={onActive}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await user.click(screen.getByRole("button", { name: "Previous page" }));
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    // The previous-page button is now disabled; focus the page to use the shortcuts.
    await user.click(screen.getByRole("group", { name: "Page 1 of 2" }));

    // Order is by page, then top to bottom: Section 61 (y 120), reply due (y 300), unlocated, amount (p2).
    await user.keyboard("n");
    await tick();
    expect(onActive).toHaveBeenLastCalledWith("section");
    expect(document.activeElement).toHaveAccessibleName(/Section 61/);
    await user.keyboard("n");
    await tick();
    expect(onActive).toHaveBeenLastCalledWith("due");
    expect(document.activeElement).toHaveAttribute("aria-current", "true");
    await user.keyboard("j");
    await user.keyboard("n");
    await tick();
    expect(onActive).toHaveBeenLastCalledWith("amount");
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(document.activeElement).toHaveAccessibleName(
      "Highlighted: tax demanded ₹4,52,300, approximate match, page 2",
    );
    expect(screen.getByText(/Highlight 4 of 4/)).toBeInTheDocument();
    await user.keyboard("p");
    await tick();
    expect(onActive).toHaveBeenLastCalledWith("hearing");
  });

  it("pages with the arrow keys and zooms with + and −", async () => {
    const user = userEvent.setup();
    const onZoom = vi.fn();
    render(
      <ProofViewer
        title="ASMT-10"
        pages={pages}
        highlights={highlights}
        defaultZoom={1}
        onZoomChange={onZoom}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(onZoom).toHaveBeenLastCalledWith(1.1);
    await user.keyboard("{ArrowRight}");
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    await user.keyboard("-");
    expect(onZoom).toHaveBeenLastCalledWith(1);
    await user.keyboard("0");
    expect(onZoom).toHaveBeenLastCalledWith("fit-width");
    expect(screen.getByRole("button", { name: "Fit width" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("lists every highlight, including unlocated ones, as a text alternative", async () => {
    const user = userEvent.setup();
    render(<ProofViewer title="ASMT-10" pages={pages} highlights={highlights} />);
    await user.click(screen.getByRole("button", { name: "Highlights (4)" }));
    const list = screen.getByRole("region", { name: "Highlights" });
    const items = within(list).getAllByRole("button");
    expect(items).toHaveLength(4);
    expect(within(list).getByText("personal hearing")).toBeInTheDocument();
    expect(within(list).getByText("Not located")).toBeInTheDocument();
    await user.click(within(list).getByText("tax demanded ₹4,52,300"));
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
  });

  it("shows the page text with quotes marked, beside the page", async () => {
    const user = userEvent.setup();
    render(
      <ProofViewer
        title="ASMT-10"
        pages={pages}
        highlights={highlights}
        languages={{ original: "English" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Show page text/ }));
    const panel = screen.getByRole("region", { name: "Page text" });
    expect(within(panel).getByText("reply within 30 days").tagName).toBe("MARK");
  });

  it("is driven by a finding card's source button", async () => {
    const user = userEvent.setup();
    render(<Case />);
    await user.click(screen.getByRole("button", { name: /Show on the page, Page 2/ }));
    await tick();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tax demanded/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("button", { name: /Show on the page, Page 2/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
