import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "../../stories/helpers";
import { Button } from "../Button/Button";
import { TextField } from "../TextField/TextField";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "./Popover";

const meta = {
  title: "Overlays/Popover",
  component: PopoverContent,
} satisfies Meta<typeof PopoverContent>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger>
        <Button>Snooze</Button>
      </PopoverTrigger>
      <PopoverContent title="Snooze until" showClose>
        <Stack gap={12}>
          <TextField label="Date" type="date" />
          <PopoverClose asChild>
            <Button variant="primary">Snooze</Button>
          </PopoverClose>
        </Stack>
      </PopoverContent>
    </Popover>
  ),
};

export const Open: Story = {
  render: () => (
    <div style={{ minHeight: "240px" }}>
      <Popover defaultOpen>
        <PopoverTrigger>
          <Button>Why this date?</Button>
        </PopoverTrigger>
        <PopoverContent title="How we worked it out" width="lg" side="bottom" align="start">
          Received 21 Oct 2026 + 30 days (section 61, CGST Act) = 20 Nov 2026.
        </PopoverContent>
      </Popover>
    </div>
  ),
};
