import { HomeIcon, InboxIcon } from "@dueproof/icons";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { addDays } from "../utils/dates";
import { Amount } from "./Amount/Amount";
import { Button } from "./Button/Button";
import { Calendar, type CalendarEvent } from "./Calendar/Calendar";
import { checkIdentifier, gstinCheckChar } from "./ClientHeader/identifiers";
import { type Command, CommandPalette } from "./CommandPalette/CommandPalette";
import { fuzzyMatch } from "./CommandPalette/fuzzy";
import { CommentComposer } from "./CommentComposer/CommentComposer";
import { ConfirmDialog } from "./ConfirmDialog/ConfirmDialog";
import { DatePicker } from "./DatePicker/DatePicker";
import { FilterBar, type FilterDefinition } from "./FilterBar/FilterBar";
import { StageStepper } from "./StageStepper/StageStepper";

const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));

describe("CommandPalette", () => {
  const make = () => {
    const ran = vi.fn();
    const commands: Command[] = [
      {
        id: "today",
        label: "Go to Today",
        group: "Go to",
        icon: HomeIcon,
        onSelect: () => ran("today"),
      },
      {
        id: "inbox",
        label: "Go to Inbox",
        group: "Go to",
        icon: InboxIcon,
        onSelect: () => ran("inbox"),
      },
      {
        id: "hvf",
        label: "Harbour Valley Foods",
        group: "Clients",
        description: "27AAACH1234M1Z5",
        keywords: ["HVF"],
        onSelect: () => ran("hvf"),
      },
      { id: "upload", label: "Upload a notice", group: "Actions", onSelect: () => ran("upload") },
      {
        id: "off",
        label: "Export to Tally",
        group: "Actions",
        disabled: true,
        onSelect: () => ran("off"),
      },
    ];
    return { ran, commands };
  };

  it("opens with ⌘K / Ctrl K, filters fuzzily and runs with Enter", async () => {
    const user = userEvent.setup();
    const { ran, commands } = make();
    render(<CommandPalette commands={commands} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "Command palette" });
    const input = within(dialog).getByRole("combobox", { name: "Search commands" });
    expect(input).toHaveFocus();
    expect(within(dialog).getAllByRole("option")).toHaveLength(5);

    await user.type(input, "hvf");
    const options = within(dialog).getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Harbour Valley Foods");
    expect(input).toHaveAttribute("aria-activedescendant", options[0]?.id);

    await user.keyboard("{Enter}");
    expect(ran).toHaveBeenCalledWith("hvf");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("moves with the arrow keys, skips disabled commands and shows recent ones", async () => {
    const user = userEvent.setup();
    const { ran, commands } = make();
    render(<CommandPalette commands={commands} />);
    await user.keyboard("{Meta>}k{/Meta}");
    const input = await screen.findByRole("combobox");
    await user.type(input, "go");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    await user.keyboard("{ArrowDown}");
    const active = screen.getByRole("option", { selected: true });
    expect(active).toHaveTextContent("Go to Inbox");
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { selected: true })).toHaveTextContent("Go to Today");
    await user.keyboard("{Enter}");
    expect(ran).toHaveBeenLastCalledWith("today");

    await user.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog");
    const recent = within(dialog).getByRole("group", { name: "Recent" });
    expect(within(recent).getByRole("option")).toHaveTextContent("Go to Today");

    // Disabled commands can't be run.
    await user.type(within(dialog).getByRole("combobox"), "tally");
    expect(screen.getByRole("option")).toHaveAttribute("aria-disabled", "true");
    await user.keyboard("{Enter}");
    expect(ran).not.toHaveBeenCalledWith("off");
  });

  it("says when nothing matches", async () => {
    const user = userEvent.setup();
    const { commands } = make();
    render(<CommandPalette commands={commands} defaultOpen />);
    await user.type(screen.getByRole("combobox"), "zzzz");
    expect(screen.getByRole("status")).toHaveTextContent(/No matches/);
  });

  it("ranks word starts and substrings first", () => {
    expect(fuzzyMatch("nd", "Notice detail")?.indexes).toEqual([0, 7]);
    expect(fuzzyMatch("xyz", "Notice detail")).toBeNull();
    const sub = fuzzyMatch("val", "Harbour Valley Foods");
    const scattered = fuzzyMatch("val", "Vendor appeal list");
    expect(sub && scattered && sub.score > scattered.score).toBe(true);
  });
});

describe("DatePicker", () => {
  const resolve = (from: string, days: number, kind: "calendar" | "working") =>
    kind === "calendar" ? addDays(from, days) : addDays(from, Math.ceil((days * 7) / 5));

  it("reads typed Indian dates and shows them as 20 Nov 2026", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<DatePicker label="Reply due" onValueChange={onValueChange} today="2026-11-16" />);
    const input = screen.getByRole("textbox", { name: "Reply due" });
    await user.type(input, "20/11/2026{Enter}");
    expect(onValueChange).toHaveBeenLastCalledWith("2026-11-20");
    expect(input).toHaveValue("20 Nov 2026");
    await user.clear(input);
    await user.type(input, "31/02/2026{Enter}");
    expect(screen.getByText(/Use a date like 20\/11\/2026/)).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("picks a date from the calendar with the keyboard", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <DatePicker
        label="Received on"
        defaultValue="2026-10-24"
        onValueChange={onValueChange}
        today="2026-11-16"
        holidays={{ "2026-11-24": "Guru Nanak Jayanti" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Change date, 24 Oct 2026" }));
    const grid = await screen.findByRole("grid", { name: "October 2026" });
    await tick();
    expect(document.activeElement).toHaveAccessibleName(/Saturday, 24 October 2026/);
    expect(within(grid).getByRole("gridcell", { selected: true })).toHaveTextContent("24");

    await user.keyboard("{ArrowRight}");
    await tick();
    expect(document.activeElement).toHaveAccessibleName(/Sunday, 25 October 2026/);
    await user.keyboard("{ArrowDown}");
    await tick();
    expect(document.activeElement).toHaveAccessibleName(/Sunday, 1 November 2026/);
    await user.keyboard("{PageDown}");
    await tick();
    expect(screen.getByRole("grid", { name: "December 2026" })).toBeInTheDocument();
    await user.keyboard("{PageUp}{Home}");
    await tick();
    expect(document.activeElement).toHaveAccessibleName(/Monday, 26 October 2026/);
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");
    await tick();
    expect(document.activeElement).toHaveAccessibleName("Monday, 23 November 2026");
    await user.keyboard("{ArrowRight}");
    await tick();
    expect(document.activeElement).toHaveAccessibleName(
      "Tuesday, 24 November 2026, holiday: Guru Nanak Jayanti",
    );
    await user.keyboard("{Enter}");
    expect(onValueChange).toHaveBeenLastCalledWith("2026-11-24");
    await waitFor(() => expect(screen.queryByRole("grid")).not.toBeInTheDocument());
  });

  it("offers 'N days from receipt' with a preview from the resolver", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <DatePicker
        label="Reply due"
        referenceDate="2026-10-24"
        resolveDate={resolve}
        onValueChange={onValueChange}
        today="2026-11-16"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Choose date" }));
    expect(await screen.findByText(/From receipt · 24 Oct 2026/)).toBeInTheDocument();
    const helper = screen.getByRole("button", { name: /30 days from receipt/ });
    expect(helper).toHaveTextContent("23 Nov 2026");
    await user.click(helper);
    expect(onValueChange).toHaveBeenLastCalledWith("2026-11-23");
  });
});

describe("Calendar", () => {
  const events: CalendarEvent[] = [
    {
      id: "a",
      date: "2026-11-16",
      title: "Reply to ASMT-10",
      state: "today",
      kind: "notice",
      client: "Harbour Valley Foods",
    },
    { id: "b", date: "2026-11-20", title: "GSTR-3B (Oct)", state: "week", kind: "statutory" },
    { id: "c", date: "2026-11-12", title: "Reply to DRC-01", state: "overdue", kind: "notice" },
    {
      id: "d",
      date: "2026-11-20",
      title: "Hearing",
      state: "week",
      kind: "hearing",
      time: "11:30",
    },
  ];

  it("moves by day, week and month from the keyboard and opens a day", async () => {
    const user = userEvent.setup();
    const onDaySelect = vi.fn();
    const onEventSelect = vi.fn();
    render(
      <Calendar
        label="Deadlines"
        events={events}
        holidays={[{ date: "2026-11-24", name: "Guru Nanak Jayanti" }]}
        today="2026-11-16"
        onDaySelect={onDaySelect}
        onEventSelect={onEventSelect}
      />,
    );
    expect(screen.getByRole("heading", { name: /November 2026/ })).toBeInTheDocument();
    const today = screen.getByRole("button", { name: "Monday, 16 November 2026, today, 1 item" });
    expect(today).toHaveAttribute("tabindex", "0");
    expect(
      screen.getByRole("button", { name: /Reply to DRC-01, Notice deadline, Overdue/ }),
    ).toBeInTheDocument();

    await user.click(today);
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}");
    await tick();
    expect(document.activeElement).toHaveAccessibleName("Friday, 20 November 2026, 2 items");
    // Tab reaches the focused day's events: all-day items first, then by time.
    await user.tab();
    expect(document.activeElement).toHaveAccessibleName(
      "GSTR-3B (Oct), Statutory filing, This week",
    );
    await user.tab();
    expect(document.activeElement).toHaveAccessibleName(/Hearing, Hearing, This week, at 11:30/);
    await user.keyboard("{Enter}");
    expect(onEventSelect).toHaveBeenCalledWith(events[3]);

    await user.click(screen.getByRole("button", { name: /Friday, 20 November 2026/ }));
    await user.keyboard("{ArrowDown}{ArrowLeft}{ArrowLeft}{ArrowLeft}");
    await tick();
    expect(document.activeElement).toHaveAccessibleName(/holiday: Guru Nanak Jayanti/);
    await user.keyboard("{PageDown}");
    await tick();
    expect(screen.getByRole("heading", { name: /December 2026/ })).toBeInTheDocument();
    await user.keyboard("t");
    await tick();
    expect(document.activeElement).toHaveAccessibleName(/16 November 2026, today/);
    await user.keyboard("{Enter}");
    expect(onDaySelect).toHaveBeenCalledWith("2026-11-16");
  });

  it("switches to a week view with seven days", async () => {
    const user = userEvent.setup();
    render(<Calendar events={events} today="2026-11-16" />);
    await user.click(screen.getByRole("radio", { name: "Week" }));
    expect(screen.getByRole("heading", { name: /16 Nov 2026 – 22 Nov 2026/ })).toBeInTheDocument();
    expect(screen.getAllByRole("gridcell")).toHaveLength(7);
    await user.click(screen.getByRole("button", { name: "Next week" }));
    expect(screen.getByRole("heading", { name: /23 Nov 2026 – 29 Nov 2026/ })).toBeInTheDocument();
  });
});

describe("ConfirmDialog", () => {
  it("enables the action only when the phrase is typed exactly", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        trigger={<Button>Delete client</Button>}
        title="Delete Harbour Valley Foods?"
        description="Its notices, deadlines and documents are deleted. This can't be undone."
        confirmLabel="Delete client"
        tone="danger"
        confirmText="Harbour Valley Foods"
        onConfirm={onConfirm}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Delete client" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete Harbour Valley Foods?" });
    const confirm = within(dialog).getByRole("button", { name: "Delete client" });
    expect(confirm).toBeDisabled();
    const field = within(dialog).getByRole("textbox", {
      name: /Type Harbour Valley Foods to confirm/,
    });
    await user.type(field, "Harbour Valley");
    expect(confirm).toBeDisabled();
    await user.type(field, " Foods");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the dialog open and shows the error when the action fails", async () => {
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        defaultOpen
        title="Remove Priya from the team?"
        confirmLabel="Remove"
        onConfirm={() => Promise.reject(new Error("You can't remove the last admin."))}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You can't remove the last admin.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("CommentComposer", () => {
  it("suggests people after @ and posts with their ids", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <CommentComposer
        users={[
          { id: "u1", name: "Priya Sharma", role: "Partner" },
          { id: "u2", name: "Rahul Mehta", role: "Manager" },
        ]}
        onSubmit={onSubmit}
      />,
    );
    const box = screen.getByRole("textbox", { name: "Comment" });
    await user.type(box, "Please review @pri");
    const list = screen.getByRole("listbox", { name: "People" });
    expect(within(list).getAllByRole("option")).toHaveLength(1);
    await user.keyboard("{Enter}");
    expect(box).toHaveValue("Please review @Priya Sharma ");
    await user.type(box, "today");
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(onSubmit).toHaveBeenCalledWith({
      text: "Please review @Priya Sharma today",
      mentionIds: ["u1"],
    });
    expect(box).toHaveValue("");
  });
});

describe("FilterBar", () => {
  const filters: FilterDefinition[] = [
    {
      id: "type",
      label: "Type",
      options: [
        { value: "asmt10", label: "ASMT-10" },
        { value: "drc01", label: "DRC-01" },
      ],
    },
  ];

  it("shows a chip per active filter, with a way to remove it", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FilterBar filters={filters} value={{ type: ["asmt10", "drc01"] }} onChange={onChange} />,
    );
    expect(screen.getByRole("button", { name: "Type: ASMT-10, DRC-01. Change" })).toHaveTextContent(
      "ASMT-10 +1",
    );
    await user.click(screen.getByRole("button", { name: "Remove Type filter" }));
    expect(onChange).toHaveBeenCalledWith({});
  });
});

describe("StageStepper", () => {
  it("speaks each stage's state", () => {
    render(<StageStepper current="approval" skipped={["appeal"]} />);
    const nav = screen.getByRole("navigation", { name: "Case stage" });
    const items = within(nav).getAllByRole("listitem");
    expect(items).toHaveLength(8);
    expect(items[0]).toHaveTextContent("Received, done");
    expect(items[3]).toHaveAttribute("aria-current", "step");
    expect(items[3]).toHaveTextContent("Partner approval, current stage");
    expect(items[6]).toHaveTextContent("Appeal, skipped");
    expect(items[7]).toHaveTextContent("Closed, not reached");
  });
});

describe("Identifiers and amounts", () => {
  it("checks GSTIN check digits, PAN, TAN and CIN formats", () => {
    const body = "27AAACH1234M1Z";
    const gstin = body + gstinCheckChar(body);
    expect(checkIdentifier("GSTIN", gstin)).toEqual({ valid: true });
    expect(checkIdentifier("GSTIN", `${body}0` === gstin ? `${body}1` : `${body}0`).valid).toBe(
      false,
    );
    expect(checkIdentifier("PAN", "AAACH1234M").valid).toBe(true);
    expect(checkIdentifier("PAN", "AAAXH1234M").reason).toMatch(/AAAPA1234A/);
    expect(checkIdentifier("TAN", "MUMH12345C").valid).toBe(true);
    expect(checkIdentifier("CIN", "U15400MH2012PTC123456").valid).toBe(true);
  });

  it("formats paise with Indian grouping and marks estimates", () => {
    const { rerender, container } = render(<Amount minor={45230000} />);
    expect(container).toHaveTextContent("₹4,52,300");
    rerender(<Amount minor={45230000} compact />);
    expect(container).toHaveTextContent("₹4.52 lakh");
    rerender(<Amount minor={1000000} to={5000000} estimate />);
    expect(screen.getByText("Estimate: ₹10,000 to ₹50,000")).toBeInTheDocument();
    expect(container).toHaveTextContent("est.");
  });
});
