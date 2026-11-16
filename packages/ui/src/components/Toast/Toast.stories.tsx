import type { Meta, StoryObj } from "@storybook/react-vite";
import { Row } from "../../stories/helpers";
import { Button } from "../Button/Button";
import { useToast } from "./Toast";

function Demo() {
  const { toast } = useToast();
  return (
    <Row>
      <Button onClick={() => toast({ title: "Saved" })}>Neutral</Button>
      <Button
        onClick={() =>
          toast({
            title: "Marked as done",
            description: "GST ASMT-10 · Arora Textiles",
            tone: "success",
            action: {
              label: "Undo",
              onClick: () => toast({ title: "Undone" }),
              altText: "Undo with ⌘Z",
            },
          })
        }
      >
        Success with undo
      </Button>
      <Button
        onClick={() =>
          toast({
            title: "Reminder not sent",
            description: "WhatsApp is not connected.",
            tone: "warning",
          })
        }
      >
        Warning
      </Button>
      <Button
        onClick={() =>
          toast({
            title: "Upload failed",
            description: "The file is password-protected.",
            tone: "danger",
          })
        }
      >
        Danger
      </Button>
      <Button onClick={() => toast({ title: "Reading 3 notices", tone: "info" })}>Info</Button>
    </Row>
  );
}

const meta = {
  title: "Feedback/Toast",
  component: Demo,
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AllTones: Story = {};
