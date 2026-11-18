/**
 * Fixes from the UX review that live in components: the case header's
 * heading when no reference was read (M7).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NoticeHeader } from "./NoticeHeader/NoticeHeader";

const base = {
  authority: "gst" as const,
  type: "GST · ASMT-10",
  issuingOffice: "CGST Range IV",
  received: "24 Oct 2026",
  client: { name: "Harbour Valley Foods" },
  stage: "new" as const,
};

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
