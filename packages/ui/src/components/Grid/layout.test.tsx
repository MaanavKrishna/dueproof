/**
 * Layout rules (README, "Layout"): the Grid primitive, page widths on every
 * template, and a guardrail that page regions pad by the page inset, never a
 * fixed amount, so a screen can't drift from its header's left edge.
 * Geometry itself is checked in a browser by apps/app/e2e/layout.spec.ts.
 */
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  DetailPageTemplate,
  Grid,
  ListPageTemplate,
  PAGE_WIDTHS,
  SettingsPageTemplate,
  UIProvider,
} from "../../index";

const css = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

describe("Grid", () => {
  it("renders its items in a list when asked, with the size and column cap", () => {
    render(
      <Grid as="ul" min="card" maxColumns={3} aria-label="Reports">
        <li>One</li>
        <li>Two</li>
      </Grid>,
    );
    const list = screen.getByRole("list", { name: "Reports" });
    expect(list).toHaveAttribute("data-min", "card");
    expect(list.style.getPropertyValue("--dp-grid-max")).toBe("3");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("defaults to panels, four at most", () => {
    const { container } = render(
      <Grid>
        <div>Overdue</div>
      </Grid>,
    );
    const grid = container.firstElementChild as HTMLElement;
    expect(grid).toHaveAttribute("data-min", "panel");
    expect(grid.style.getPropertyValue("--dp-grid-max")).toBe("4");
  });

  it("takes each size's narrowest column from the layout tokens", () => {
    const source = css("./Grid.module.css");
    for (const size of ["stat", "card", "panel"]) {
      expect(source).toContain(`--dp-grid-min: var(--dp-layout-column-${size})`);
    }
    // Items grow, so a short last row fills the width instead of leaving a gap.
    expect(source).toMatch(/flex: 1 1/);
    expect(source).toContain("flex-wrap: wrap");
  });
});

describe("page widths", () => {
  it("lists the four widths", () => {
    expect(PAGE_WIDTHS).toEqual(["full", "wide", "readable", "narrow"]);
  });

  it("gives every width but full a token limit", () => {
    const source = css("../../templates/templates.module.css");
    for (const w of ["wide", "readable", "narrow"]) {
      expect(source).toContain(`.column[data-width="${w}"]`);
      expect(source).toContain(`var(--dp-layout-page-${w})`);
    }
  });

  it("defaults lists to full, records to wide and settings to readable", () => {
    const { container, unmount } = render(
      <UIProvider>
        <ListPageTemplate title="Notices">rows</ListPageTemplate>
      </UIProvider>,
    );
    expect(container.querySelector("[data-width]")).toHaveAttribute("data-width", "full");
    unmount();

    const detail = render(
      <UIProvider>
        <DetailPageTemplate title="ZD29" header={<h1>ZD29</h1>} />
      </UIProvider>,
    );
    expect(detail.container.querySelector("[data-width]")).toHaveAttribute("data-width", "wide");
    detail.unmount();

    const settings = render(
      <UIProvider>
        <SettingsPageTemplate
          title="Settings"
          sections={[{ id: "me", label: "Me" }]}
          activeSection="me"
        >
          forms
        </SettingsPageTemplate>
      </UIProvider>,
    );
    expect(settings.container.querySelector("[data-width]")).toHaveAttribute(
      "data-width",
      "readable",
    );
  });

  it("takes a width", () => {
    const { container } = render(
      <UIProvider>
        <ListPageTemplate title="Capture" width="narrow">
          body
        </ListPageTemplate>
      </UIProvider>,
    );
    expect(container.querySelector("[data-width]")).toHaveAttribute("data-width", "narrow");
  });
});

describe("guardrail: page regions pad by the page inset", () => {
  const regions: [string, string[]][] = [
    [
      "../../templates/templates.module.css",
      ["banner", "summary", "filters", "listBody", "stageBar", "detailBody"],
    ],
    ["../Toolbar/Toolbar.module.css", ["large", "compactMeta", "accessory"]],
    ["../SettingsLayout/SettingsLayout.module.css", ["layout"]],
  ];
  for (const [file, classes] of regions) {
    const source = css(file);
    for (const cls of classes) {
      it(`${file.split("/").pop()} .${cls}`, () => {
        const block = source.match(new RegExp(`\\.${cls} \\{([^}]*)\\}`))?.[1] ?? "";
        expect(block).toMatch(/padding[^;]*var\(--dp-page-inset/);
      });
    }
  }
});
