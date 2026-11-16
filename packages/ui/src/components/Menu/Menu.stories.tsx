import {
  ArchiveIcon,
  CopyIcon,
  EditIcon,
  MoreIcon,
  ShareIcon,
  TrashIcon,
  UserIcon,
} from "@dueproof/icons";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { IconButton } from "../IconButton/IconButton";
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from "./Menu";

const meta = {
  title: "Overlays/Menu",
  component: MenuContent,
} satisfies Meta<typeof MenuContent>;
export default meta;
type Story = StoryObj<typeof meta>;

function Example({ open = false }: { open?: boolean }) {
  const [showClosed, setShowClosed] = useState(true);
  const [sort, setSort] = useState("due");
  return (
    <div style={{ minHeight: "420px" }}>
      <Menu defaultOpen={open}>
        <MenuTrigger>
          <IconButton icon={MoreIcon} label="Notice actions" tooltip={false} variant="secondary" />
        </MenuTrigger>
        <MenuContent>
          <MenuItem icon={EditIcon} shortcut="E">
            Edit details
          </MenuItem>
          <MenuItem icon={UserIcon} description="Riya Mehta">
            Reassign
          </MenuItem>
          <MenuItem icon={CopyIcon} shortcut="⌘D">
            Duplicate
          </MenuItem>
          <MenuSub>
            <MenuSubTrigger icon={ShareIcon}>Share</MenuSubTrigger>
            <MenuSubContent>
              <MenuItem>Copy link</MenuItem>
              <MenuItem>Email evidence report</MenuItem>
            </MenuSubContent>
          </MenuSub>
          <MenuItem icon={ArchiveIcon} disabled>
            Archive
          </MenuItem>
          <MenuSeparator />
          <MenuLabel>View</MenuLabel>
          <MenuCheckboxItem checked={showClosed} onCheckedChange={(c) => setShowClosed(c === true)}>
            Show closed
          </MenuCheckboxItem>
          <MenuRadioGroup value={sort} onValueChange={setSort}>
            <MenuRadioItem value="due">Sort by due date</MenuRadioItem>
            <MenuRadioItem value="client">Sort by client</MenuRadioItem>
          </MenuRadioGroup>
          <MenuSeparator />
          <MenuItem icon={TrashIcon} destructive>
            Delete notice
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );
}

export const Default: Story = { render: () => <Example /> };
export const Open: Story = { render: () => <Example open /> };
