import type { Meta, StoryObj } from "@storybook/react-vite";
import { Row, Stack } from "../../stories/helpers";
import { Button } from "../Button/Button";
import { TextArea } from "../TextArea/TextArea";
import { TextField } from "../TextField/TextField";
import { Dialog, DialogClose } from "./Dialog";

const meta = {
  title: "Overlays/Dialog",
  component: Dialog,
  args: { title: "Correct the reply date" },
} satisfies Meta<typeof Dialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Form: Story = {
  render: () => (
    <Dialog
      trigger={<Button>Correct date</Button>}
      title="Correct the reply date"
      description="The original date stays beside the correction, with your reason."
      dismissible={false}
      footer={
        <>
          <DialogClose>
            <Button>Cancel</Button>
          </DialogClose>
          <Button variant="primary">Save correction</Button>
        </>
      }
    >
      <Stack gap={16}>
        <TextField label="New date" type="date" />
        <TextArea label="Reason" rows={2} />
      </Stack>
    </Dialog>
  ),
};

export const Destructive: Story = {
  render: () => (
    <Dialog
      defaultOpen
      size="sm"
      trigger={<Button variant="destructive">Delete</Button>}
      title="Delete this notice?"
      description="Its findings, proof and activity go too. This can't be undone."
      footer={
        <>
          <DialogClose>
            <Button>Cancel</Button>
          </DialogClose>
          <Button variant="destructive">Delete notice</Button>
        </>
      }
    />
  ),
};

export const Sizes: Story = {
  render: () => (
    <Row>
      {(["sm", "md", "lg"] as const).map((size) => (
        <Dialog key={size} size={size} trigger={<Button>{size}</Button>} title={`Size ${size}`}>
          Dialog body text. Dialogs become bottom sheets on phones.
        </Dialog>
      ))}
    </Row>
  ),
};
