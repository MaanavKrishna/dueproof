import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  Button,
  Checkbox,
  Combobox,
  Dialog,
  DialogClose,
  DueChip,
  dueLadder,
  formatPaise,
  MoneyField,
  rupeesToPaise,
  SearchField,
  SegmentedControl,
  Switch,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Tag,
  TextField,
  UIProvider,
  useToast,
} from "../index";

const segments = [
  { value: "list", label: "List" },
  { value: "board", label: "Board" },
  { value: "calendar", label: "Calendar" },
];

describe("SegmentedControl", () => {
  it("is a radio group whose arrow keys move and select", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="View"
        segments={segments}
        defaultValue="list"
        onValueChange={onValueChange}
      />,
    );
    const group = screen.getByRole("radiogroup", { name: "View" });
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(radios[0]).toHaveAttribute("aria-checked", "true");

    // Radix moves focus on the next tick, as a browser does long before keyup,
    // so hold the key down until focus has moved.
    const press = async (key: string) => {
      await user.keyboard(`{${key}>}`);
      await act(() => new Promise((r) => setTimeout(r, 0)));
      await user.keyboard(`{/${key}}`);
    };

    await user.tab();
    expect(radios[0]).toHaveFocus();
    await press("ArrowRight");
    expect(radios[1]).toHaveFocus();
    expect(radios[1]).toHaveAttribute("aria-checked", "true");
    expect(onValueChange).toHaveBeenLastCalledWith("board");

    await press("ArrowRight");
    await press("ArrowRight");
    expect(radios[0]).toHaveFocus(); // loops
    expect(onValueChange).toHaveBeenLastCalledWith("list");

    await press("ArrowLeft");
    expect(onValueChange).toHaveBeenLastCalledWith("calendar");
  });

  it("leaves the group with a single Tab", async () => {
    const user = userEvent.setup();
    render(
      <>
        <SegmentedControl aria-label="View" segments={segments} />
        <button type="button">After</button>
      </>,
    );
    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
  });
});

function Harness() {
  return (
    <>
      <Dialog
        trigger={<Button>Open</Button>}
        title="Mark as replied"
        description="This moves the notice to Replied."
        footer={
          <>
            <DialogClose>
              <Button>Cancel</Button>
            </DialogClose>
            <Button variant="primary">Confirm</Button>
          </>
        }
      >
        <TextField label="Reference" />
      </Dialog>
      <button type="button">Outside</button>
    </>
  );
}

describe("Dialog", () => {
  it("traps focus, closes on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open" });
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "Mark as replied" });
    expect(dialog).toHaveAccessibleDescription("This moves the notice to Replied.");
    expect(dialog.contains(document.activeElement)).toBe(true);

    // Tab many times: focus never leaves the dialog.
    for (let i = 0; i < 8; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard("{Escape}");
    await act(async () => {});
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes from a DialogClose button", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    await act(async () => {});
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("DueChip", () => {
  it.each(Object.entries(dueLadder))("%s shows its word and an icon", (state, rung) => {
    const { container } = render(<DueChip state={state as keyof typeof dueLadder} />);
    expect(screen.getByText(rung.label)).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.firstElementChild).toHaveAttribute("data-state", state);
  });

  it("uses the agreed words", () => {
    expect(Object.values(dueLadder).map((r) => r.label)).toEqual([
      "Overdue",
      "Due today",
      "This week",
      "Later",
      "Done",
    ]);
  });

  it("shows a detail after the word", () => {
    render(<DueChip state="overdue" detail="3 days" />);
    expect(screen.getByText("3 days")).toBeInTheDocument();
  });
});

describe("money", () => {
  it("parses rupees to integer paise without float error", () => {
    expect(rupeesToPaise("4,52,300.50")).toBe(45230050);
    expect(rupeesToPaise("₹ 0.1")).toBe(10);
    expect(rupeesToPaise("19.99")).toBe(1999);
    expect(rupeesToPaise("")).toBeNull();
  });
  it("formats paise with Indian grouping", () => {
    expect(formatPaise(45230000)).toBe("4,52,300");
    expect(formatPaise(45230050)).toBe("4,52,300.50");
    expect(formatPaise(1234567890)).toBe("1,23,45,678.90");
    expect(formatPaise(5, { alwaysPaise: true })).toBe("0.05");
  });
});

describe("MoneyField", () => {
  it("takes typed rupees, reports paise and shows ₹ grouping on blur", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<MoneyField label="Demand" onValueChange={onValueChange} />);
    const input = screen.getByRole("textbox", { name: "Demand" });
    await user.type(input, "452300.5x");
    expect(onValueChange).toHaveBeenLastCalledWith(45230050);
    expect(input).toHaveValue("452300.5");
    await user.tab();
    expect(input).toHaveValue("4,52,300.50");
  });

  it("shows a controlled value", () => {
    render(<MoneyField label="Paid" value={1000000} />);
    expect(screen.getByRole("textbox", { name: "Paid" })).toHaveValue("10,000");
  });

  it("limits to two decimals", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<MoneyField label="Amount" onValueChange={onValueChange} />);
    await user.type(screen.getByRole("textbox", { name: "Amount" }), "1.239");
    expect(onValueChange).toHaveBeenLastCalledWith(123);
  });
});

describe("Combobox", () => {
  const clients = [
    { value: "a", label: "Arora Textiles", description: "07AAACA1234F1Z5" },
    { value: "b", label: "Bharat Steel", description: "27AAACB9876K1Z2" },
    { value: "c", label: "Chennai Ports", description: "33AAACC5555L1Z9", disabled: true },
  ];

  it("filters as you type and chooses with the keyboard", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Combobox label="Client" options={clients} onValueChange={onValueChange} />);
    const input = screen.getByRole("combobox", { name: "Client" });
    await user.type(input, "bha");
    expect(input).toHaveAttribute("aria-expanded", "true");
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(input).toHaveAttribute("aria-activedescendant", options[0]?.id);
    await user.keyboard("{Enter}");
    expect(onValueChange).toHaveBeenCalledWith("b");
    expect(input).toHaveValue("Bharat Steel");
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("searches descriptions and skips disabled options", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Combobox label="Client" options={clients} onValueChange={onValueChange} />);
    const input = screen.getByRole("combobox", { name: "Client" });
    await user.type(input, "27AAACB");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    await user.clear(input);
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{Enter}");
    // Starts on a; ↓ b; ↓ skips disabled c and wraps to a; ↓ b.
    expect(onValueChange).toHaveBeenLastCalledWith("b");
  });

  it("shows the empty text and closes on Escape", async () => {
    const user = userEvent.setup();
    render(<Combobox label="Client" options={clients} emptyText="No clients match" />);
    const input = screen.getByRole("combobox", { name: "Client" });
    await user.type(input, "zzz");
    expect(screen.getByText("No clients match")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(input).toHaveAttribute("aria-expanded", "false");
  });
});

describe("Button", () => {
  it("blocks clicks and announces busy while loading", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("aria-busy", "true");
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("defaults to type=button", () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("accepts ref as a prop", () => {
    let node: HTMLButtonElement | null = null;
    render(
      <Button
        ref={(n) => {
          node = n;
        }}
      >
        Go
      </Button>,
    );
    expect(node).toBeInstanceOf(HTMLButtonElement);
  });
});

describe("SearchField", () => {
  it("clears with Escape and with the clear button", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(<SearchField label="Search notices" onClear={onClear} />);
    const input = screen.getByRole("searchbox", { name: "Search notices" });
    await user.type(input, "GST");
    await user.keyboard("{Escape}");
    expect(input).toHaveValue("");
    await user.type(input, "ITR");
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(input).toHaveValue("");
    expect(onClear).toHaveBeenCalledTimes(2);
  });
});

describe("form controls", () => {
  it("TextField wires label, description and error", () => {
    render(<TextField label="PAN" description="10 characters" error="That PAN is not valid" />);
    const input = screen.getByRole("textbox", { name: "PAN" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("That PAN is not valid 10 characters");
  });

  it("Checkbox and Switch toggle by keyboard", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Checkbox label="Include closed notices" />
        <Switch label="Email digest" />
      </>,
    );
    const checkbox = screen.getByRole("checkbox", { name: "Include closed notices" });
    const toggle = screen.getByRole("switch", { name: "Email digest" });
    await user.tab();
    await user.keyboard(" ");
    expect(checkbox).toHaveAttribute("aria-checked", "true");
    await user.tab();
    await user.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("Tag removes from its button and with Backspace", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<Tag label="Delhi" onRemove={onRemove} />);
    const remove = screen.getByRole("button", { name: "Remove Delhi" });
    await user.click(remove);
    remove.focus();
    await user.keyboard("{Backspace}");
    expect(onRemove).toHaveBeenCalledTimes(2);
  });
});

describe("Tabs", () => {
  it("moves between tabs with arrow keys", async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="summary">
        <TabList aria-label="Notice">
          <Tab value="summary">Summary</Tab>
          <Tab value="findings" count={4}>
            Findings
          </Tab>
        </TabList>
        <TabPanel value="summary">Summary panel</TabPanel>
        <TabPanel value="findings">Findings panel</TabPanel>
      </Tabs>,
    );
    await user.tab();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /Findings/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Findings panel")).toBeVisible();
  });
});

function Shower() {
  const { toast } = useToast();
  const [n, setN] = useState(0);
  return (
    <Button
      onClick={() => {
        setN(n + 1);
        toast({
          title: "Marked as done",
          tone: "success",
          action: { label: "Undo", onClick: () => {} },
        });
      }}
    >
      Show
    </Button>
  );
}

describe("Toast", () => {
  it("shows a toast with its action, and dismisses it", async () => {
    const user = userEvent.setup();
    render(
      <UIProvider>
        <Shower />
      </UIProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(await screen.findByText("Marked as done")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    await act(async () => {});
    expect(screen.queryByText("Marked as done")).not.toBeInTheDocument();
  });
});
