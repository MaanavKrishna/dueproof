import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { settingsSections } from "../../stories/fixtures";
import { Button } from "../Button/Button";
import { Select } from "../Select/Select";
import { Switch } from "../Switch/Switch";
import { TextField } from "../TextField/TextField";
import { SettingsLayout, SettingsRow, SettingsSection } from "./SettingsLayout";

const meta = {
  title: "Structure/SettingsLayout",
  component: SettingsLayout,
  args: { sections: settingsSections, activeId: "org", children: null },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof SettingsLayout>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function Render(args) {
    const [active, setActive] = useState(args.activeId);
    return (
      <SettingsLayout {...args} activeId={active} onSectionChange={setActive}>
        <SettingsSection
          title="Organisation"
          description="Shown on reports and the evidence report cover."
        >
          <SettingsRow label="Name" stacked>
            <TextField label="Organisation name" hideLabel defaultValue="Mehta Iyer & Associates" />
          </SettingsRow>
          <SettingsRow label="Financial year" description="India: April to March.">
            <Select
              label="Financial year"
              hideLabel
              defaultValue="apr"
              options={[
                { value: "apr", label: "April – March" },
                { value: "jan", label: "January – December" },
              ]}
            />
          </SettingsRow>
          <SettingsRow
            label="Saturdays are working days"
            description="Used when counting working days."
          >
            <Switch aria-label="Saturdays are working days" defaultChecked />
          </SettingsRow>
        </SettingsSection>
        <SettingsSection title="Approvals" actions={<Button size="sm">Add approver</Button>}>
          <SettingsRow label="Who may approve replies" description="Never the person who asked.">
            <span>Priya Sharma, Rahul Mehta</span>
          </SettingsRow>
        </SettingsSection>
      </SettingsLayout>
    );
  },
};
