import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Button } from "../Button/Button";
import { DataTable, type DataTableColumn } from "./DataTable";

interface Notice {
  id: string;
  client: string;
  reference: string;
  demand: number;
}

const data: Notice[] = Array.from({ length: 5000 }, (_, i) => ({
  id: `n${i}`,
  client: ["Harbour Valley Foods", "Anand Textiles", "Zenith Pharma"][i % 3] ?? "",
  reference: `ZD27${String(i).padStart(6, "0")}`,
  demand: (i * 7919) % 100000,
}));

const columns: DataTableColumn<Notice>[] = [
  { id: "client", header: "Client", accessor: (r) => r.client, width: "lg" },
  { id: "reference", header: "Reference", accessor: (r) => r.reference },
  { id: "demand", header: "Demand", accessor: (r) => r.demand, align: "end" },
];

// jsdom has no layout: give the scroll area a height so the virtualiser renders rows.
let restore: () => void;
beforeAll(() => {
  const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return (this as HTMLElement).getAttribute("role") === "grid" ? 480 : 0;
    },
  });
  const scrollHeight = Object.getOwnPropertyDescriptor(Element.prototype, "scrollHeight");
  Object.defineProperty(Element.prototype, "scrollHeight", {
    configurable: true,
    get() {
      return (this as Element).getAttribute("role") === "grid" ? 48 * 5001 : 0;
    },
  });
  // …and make programmatic scrolling fire a scroll event, as a browser does.
  const scrollTo = Element.prototype.scrollTo;
  Element.prototype.scrollTo = function (this: Element, opts?: ScrollToOptions | number) {
    if (typeof opts === "object" && opts.top !== undefined) this.scrollTop = opts.top;
    this.dispatchEvent(new Event("scroll"));
  } as typeof Element.prototype.scrollTo;
  restore = () => {
    if (desc) Object.defineProperty(HTMLElement.prototype, "clientHeight", desc);
    Element.prototype.scrollTo = scrollTo;
    if (scrollHeight) Object.defineProperty(Element.prototype, "scrollHeight", scrollHeight);
  };
});
afterAll(() => restore());

/**
 * Wait for keyboard focus to land on a cell. Focus can follow a scroll and a
 * re-render of the virtualised rows (a frame later), so a fixed delay is
 * flaky on a busy runner: poll instead.
 */
const focusedCell = async (check: (el: HTMLElement) => void) => {
  await waitFor(() => check(document.activeElement as HTMLElement), { timeout: 5_000 });
  return document.activeElement as HTMLElement;
};

describe("DataTable", () => {
  it("is a grid that renders only the visible slice of 5 000 rows", () => {
    render(<DataTable label="Notices" columns={columns} data={data} getRowId={(r) => r.id} />);
    const grid = screen.getByRole("grid", { name: "Notices" });
    expect(grid).toHaveAttribute("aria-rowcount", "5001");
    const rows = within(grid).getAllByRole("row");
    // Header + a window of rows, far fewer than 5 000.
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.length).toBeLessThan(60);
    expect(screen.getByRole("columnheader", { name: /Client/ })).toHaveAttribute(
      "aria-sort",
      "none",
    );
  });

  it("sorts from the header and announces the direction", async () => {
    const user = userEvent.setup();
    const onSortingChange = vi.fn();
    render(
      <DataTable
        label="Notices"
        columns={columns}
        data={data.slice(0, 20)}
        getRowId={(r) => r.id}
        onSortingChange={onSortingChange}
      />,
    );
    const header = screen.getByRole("columnheader", { name: /Demand/ });
    await user.click(header);
    expect(header).toHaveAttribute("aria-sort", "ascending");
    expect(onSortingChange).toHaveBeenLastCalledWith([{ id: "demand", desc: false }]);
    const firstRow = screen.getAllByRole("row")[1];
    const min = Math.min(...data.slice(0, 20).map((d) => d.demand));
    expect(within(firstRow as HTMLElement).getAllByRole("gridcell")[2]).toHaveTextContent(
      String(min),
    );
    await user.click(header);
    expect(header).toHaveAttribute("aria-sort", "descending");
  });

  it("moves focus cell by cell with the arrow keys and opens a row with Enter", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(
      <DataTable
        label="Notices"
        columns={columns}
        data={data}
        getRowId={(r) => r.id}
        onRowClick={onRowClick}
        columnChooser={false}
      />,
    );
    await user.tab();
    const first = document.activeElement as HTMLElement;
    expect(first).toHaveAttribute("role", "gridcell");
    expect(first.dataset.row).toBe("0");
    expect(first.dataset.col).toBe("0");

    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowRight}");
    const cell = await focusedCell((el) => {
      expect(el.dataset.row).toBe("2");
      expect(el.dataset.col).toBe("1");
    });
    expect(cell).toHaveTextContent("ZD27000002");
    // Only one cell is in the tab order.
    expect(document.querySelectorAll('[role="grid"] [tabindex="0"]')).toHaveLength(1);

    await user.keyboard("{Enter}");
    expect(onRowClick).toHaveBeenCalledWith(data[2]);

    await user.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}");
    await focusedCell((el) => expect(el).toHaveAttribute("role", "columnheader"));

    await user.keyboard("{Control>}{End}{/Control}");
    const last = await focusedCell((el) => expect(el.dataset.row).toBe("4999"));
    expect(last).toHaveTextContent(String(data[4999]?.demand));
  });

  it("selects rows with Space, announces the count and shows the bulk bar", async () => {
    const user = userEvent.setup();
    const onSelectedIdsChange = vi.fn();
    render(
      <DataTable
        label="Notices"
        columns={columns}
        data={data.slice(0, 30)}
        getRowId={(r) => r.id}
        selectable
        onSelectedIdsChange={onSelectedIdsChange}
        bulkActions={({ ids }) => <Button size="sm">Assign {ids.length}</Button>}
      />,
    );
    await user.tab();
    await user.keyboard(" ");
    expect(onSelectedIdsChange).toHaveBeenLastCalledWith(["n0"]);
    await user.keyboard("{ArrowDown}");
    await focusedCell((el) => expect(el.dataset.row).toBe("1"));
    await user.keyboard(" ");
    await waitFor(() => expect(onSelectedIdsChange).toHaveBeenLastCalledWith(["n0", "n1"]));
    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveAttribute("aria-selected", "true");
    expect(rows[3]).toHaveAttribute("aria-selected", "false");
    expect(screen.getByText("2 rows selected")).toBeInTheDocument();
    const bar = screen.getByRole("region", { name: "Bulk actions" });
    expect(within(bar).getByRole("button", { name: "Assign 2" })).toBeInTheDocument();

    await user.keyboard("{Control>}a{/Control}");
    expect(onSelectedIdsChange).toHaveBeenLastCalledWith(data.slice(0, 30).map((d) => d.id));

    await user.keyboard("{Escape}");
    expect(onSelectedIdsChange).toHaveBeenLastCalledWith([]);
  });

  it("selects all from the header checkbox", async () => {
    const user = userEvent.setup();
    render(
      <DataTable
        label="Notices"
        columns={columns}
        data={data.slice(0, 4)}
        getRowId={(r) => r.id}
        selectable
      />,
    );
    await user.click(screen.getByRole("checkbox", { name: "Select all rows" }));
    expect(screen.getByText("4 rows selected")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Deselect all rows" })).toBeChecked();
  });

  it("hides a column from the column chooser", async () => {
    const user = userEvent.setup();
    render(
      <DataTable
        label="Notices"
        columns={columns}
        data={data.slice(0, 5)}
        getRowId={(r) => r.id}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Choose columns" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Reference" }));
    expect(screen.queryByRole("columnheader", { name: /Reference/ })).not.toBeInTheDocument();
  });

  it("shows loading, empty and error states", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { rerender } = render(
      <DataTable label="Notices" columns={columns} data={[]} getRowId={(r) => r.id} loading />,
    );
    expect(screen.getByRole("grid")).toHaveAttribute("aria-busy", "true");
    rerender(<DataTable label="Notices" columns={columns} data={[]} getRowId={(r) => r.id} />);
    expect(screen.getByRole("heading", { name: "Nothing here" })).toBeInTheDocument();
    rerender(
      <DataTable
        label="Notices"
        columns={columns}
        data={[]}
        getRowId={(r) => r.id}
        error={{ title: "Couldn't load notices", onRetry }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
  });
});
