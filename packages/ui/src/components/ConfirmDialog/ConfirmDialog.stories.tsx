import { TrashIcon } from "@dueproof/icons";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../Button/Button";
import { ConfirmDialog } from "./ConfirmDialog";

const meta = {
  title: "Structure/ConfirmDialog",
  component: ConfirmDialog,
  args: {
    title: "Move the case back to Draft reply?",
    description: "Partner approval will be withdrawn. Priya Sharma will be told.",
    confirmLabel: "Move back",
    onConfirm: () => {},
    defaultOpen: true,
  },
} satisfies Meta<typeof ConfirmDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const TypeToConfirm: Story = {
  args: {
    title: "Delete Harbour Valley Foods Pvt Ltd?",
    description:
      "Its 4 notices, 11 deadlines and 23 documents are deleted for everyone. This can't be undone.",
    confirmLabel: "Delete client",
    tone: "danger",
    confirmText: "Harbour Valley Foods Pvt Ltd",
    trigger: (
      <Button variant="destructive" icon={TrashIcon}>
        Delete client
      </Button>
    ),
  },
};

export const SlowAction: Story = {
  args: {
    title: "Approve the reply?",
    description: "Rahul Mehta asked for approval. It will be marked ready to file.",
    confirmLabel: "Approve",
    onConfirm: () => new Promise<void>((r) => setTimeout(r, 1500)),
  },
};

export const Failure: Story = {
  args: {
    title: "Remove Vikram Rao from the team?",
    confirmLabel: "Remove",
    tone: "danger",
    onConfirm: () =>
      new Promise<void>((_, reject) =>
        setTimeout(
          () => reject(new Error("Vikram owns 6 open notices. Reassign them first.")),
          600,
        ),
      ),
  },
};
