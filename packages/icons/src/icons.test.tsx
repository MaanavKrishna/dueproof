import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Icon } from "./index";
import * as icons from "./index";

afterEach(cleanup);

const all = Object.entries(icons).filter(([name]) => /^[A-Z]\w*Icon$/.test(name)) as [
  string,
  Icon,
][];

describe("icons", () => {
  it("exports the custom set", () => {
    for (const name of [
      "NoticeIcon",
      "HearingIcon",
      "ProofIcon",
      "ReceiptIcon",
      "GstIcon",
      "IncomeTaxIcon",
      "RocIcon",
      "CourtIcon",
      "AiSuggestedIcon",
      "VerifiedIcon",
      "StatutoryFilingIcon",
      "SebiIcon",
      "RbiIcon",
      "TdsIcon",
      "CalendarStatutoryIcon",
      "ApprovalIcon",
      "FiledAckIcon",
      "WhatsappIntakeIcon",
      "ExposureIcon",
      "HearingPackIcon",
    ]) {
      expect(icons).toHaveProperty(name);
    }
  });

  it.each(all)("%s renders at 20px with a 1.5 stroke, decorative by default", (_, Component) => {
    const { container } = render(<Component />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("width")).toBe("20");
    expect(svg?.getAttribute("stroke-width")).toBe("1.5");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
  });

  it("is announced when labelled", () => {
    const { container } = render(<icons.ProofIcon label="Proof" size={24} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("aria-label")).toBe("Proof");
    expect(svg?.getAttribute("aria-hidden")).toBeNull();
    expect(svg?.getAttribute("width")).toBe("24");
  });

  it("forwards refs as a prop", () => {
    let node: SVGSVGElement | null = null;
    render(
      <icons.SearchIcon
        ref={(n) => {
          node = n;
        }}
      />,
    );
    expect(node).toBeInstanceOf(SVGSVGElement);
  });
});
