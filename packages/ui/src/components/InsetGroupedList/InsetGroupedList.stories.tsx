import { BellIcon, LockIcon, LogOutIcon, MoonIcon, UserIcon } from "@dueproof/icons";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Stack } from "../../stories/helpers";
import { InsetGroupedList, ListRow } from "./InsetGroupedList";

const meta = {
  title: "Structure/InsetGroupedList",
  component: InsetGroupedList,
  args: { children: null },
} satisfies Meta<typeof InsetGroupedList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AllRowKinds: Story = {
  render: function Render() {
    const [digest, setDigest] = useState(true);
    const [wa, setWa] = useState(false);
    return (
      <Stack width="28rem" gap={24}>
        <InsetGroupedList header="Account" footer="Your name appears on approvals and reports.">
          <ListRow
            icon={UserIcon}
            label="Priya Sharma"
            description="Partner · priya@mehtaiyer.in"
            onClick={() => {}}
          />
          <ListRow
            icon={LockIcon}
            label="Passkeys and two-step sign-in"
            value="2 passkeys"
            onClick={() => {}}
          />
          <ListRow icon={MoonIcon} label="Appearance" value="System" onClick={() => {}} />
        </InsetGroupedList>
        <InsetGroupedList header="Notifications">
          <ListRow
            icon={BellIcon}
            label="Morning digest by email"
            description="Overdue, due today, this week, hearings"
            toggle={{ checked: digest, onCheckedChange: setDigest }}
          />
          <ListRow label="Digest on WhatsApp" toggle={{ checked: wa, onCheckedChange: setWa }} />
          <ListRow label="Time zone" value="India (IST, UTC+5:30)" />
          <ListRow label="Escalate to partner after" value="3 days" disabled />
        </InsetGroupedList>
        <InsetGroupedList>
          <ListRow
            icon={LogOutIcon}
            label="Sign out"
            tone="danger"
            onClick={() => {}}
            chevron={false}
          />
        </InsetGroupedList>
      </Stack>
    );
  },
};
