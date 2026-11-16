import { CopyIcon, EditIcon, ProofIcon, TrashIcon, UserIcon } from "@dueproof/icons";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { people } from "../../stories/fixtures";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "./ContextMenu";

const meta: Meta<typeof ContextMenu> = {
  title: "Structure/ContextMenu",
  component: ContextMenu,
};
export default meta;
type Story = StoryObj<typeof ContextMenu>;

export const OnARow: Story = {
  render: () => (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          style={{
            padding: "var(--dp-space-16)",
            borderRadius: "var(--dp-radius-lg)",
            background: "var(--dp-bg-surface)",
            boxShadow: "var(--dp-shadow-1)",
            maxWidth: "32rem",
          }}
        >
          ASMT-10 · Harbour Valley Foods — right-click (or Shift F10) for actions
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>Notice</ContextMenuLabel>
        <ContextMenuItem icon={ProofIcon} shortcut="⌘↩">
          Open with proof
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger icon={UserIcon}>Assign to</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {people.map((p) => (
              <ContextMenuItem key={p.id} description={p.role}>
                {p.name}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem icon={EditIcon}>Correct received date…</ContextMenuItem>
        <ContextMenuItem icon={CopyIcon} shortcut="⌘C">
          Copy reference
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem icon={TrashIcon} destructive>
          Delete…
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  ),
};
