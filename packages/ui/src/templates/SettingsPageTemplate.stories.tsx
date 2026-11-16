import { AddIcon } from "@dueproof/icons";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Avatar } from "../components/Avatar/Avatar";
import { Badge } from "../components/Badge/Badge";
import { Button } from "../components/Button/Button";
import { InsetGroupedList, ListRow } from "../components/InsetGroupedList/InsetGroupedList";
import { Select } from "../components/Select/Select";
import { SettingsRow, SettingsSection } from "../components/SettingsLayout/SettingsLayout";
import { Switch } from "../components/Switch/Switch";
import { TextField } from "../components/TextField/TextField";
import { people, settingsSections } from "../stories/fixtures";
import { DemoShell } from "../stories/shell";
import { SettingsPageTemplate } from "./SettingsPageTemplate";

const meta: Meta<typeof SettingsPageTemplate> = {
  title: "Templates/Settings page",
  component: SettingsPageTemplate,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof SettingsPageTemplate>;

function OrganisationForm({ onChange }: { onChange: () => void }) {
  return (
    <>
      <SettingsSection
        title="Organisation"
        description="Your firm's name and logo appear on reports and the evidence report cover."
      >
        <SettingsRow label="Firm name" stacked>
          <TextField
            label="Firm name"
            hideLabel
            defaultValue="Mehta Iyer & Associates"
            onChange={onChange}
          />
        </SettingsRow>
        <SettingsRow
          label="Financial year"
          description="Used for FY labels and the statutory calendar."
        >
          <Select
            label="Financial year"
            hideLabel
            defaultValue="apr"
            onValueChange={onChange}
            options={[
              { value: "apr", label: "April – March (India)" },
              { value: "jan", label: "January – December" },
            ]}
          />
        </SettingsRow>
        <SettingsRow label="Time zone" description="Due dates and digests use this time zone.">
          <Select
            label="Time zone"
            hideLabel
            defaultValue="ist"
            onValueChange={onChange}
            options={[{ value: "ist", label: "India (IST, UTC+5:30)" }]}
          />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection
        title="Working days and holidays"
        description="Working-day counts skip these days."
      >
        <SettingsRow label="Saturdays are working days">
          <Switch
            aria-label="Saturdays are working days"
            defaultChecked
            onCheckedChange={onChange}
          />
        </SettingsRow>
        <SettingsRow
          label="Holiday list"
          description="Maharashtra 2026 · 24 holidays · from the India pack (verify)"
        >
          <Button size="sm">Edit holidays</Button>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection
        title="Who may approve replies"
        description="Approval can never be given by the person who asked for it."
        actions={
          <Button size="sm" icon={AddIcon}>
            Add approver
          </Button>
        }
      >
        <InsetGroupedList>
          {people.slice(0, 2).map((p) => (
            <ListRow
              key={p.id}
              label={
                <span
                  style={{ display: "inline-flex", alignItems: "center", gap: "var(--dp-space-8)" }}
                >
                  <Avatar name={p.name} size="xs" />
                  {p.name}
                </span>
              }
              value={<Badge size="sm">{p.role}</Badge>}
            />
          ))}
        </InsetGroupedList>
      </SettingsSection>
      <SettingsSection
        title="Escalation"
        description="Overdue items go to the manager, then the client's partner."
      >
        <SettingsRow label="Tell the manager after">
          <Select
            label="Manager after"
            hideLabel
            defaultValue="1"
            onValueChange={onChange}
            options={[
              { value: "1", label: "1 day" },
              { value: "2", label: "2 days" },
              { value: "3", label: "3 days" },
            ]}
          />
        </SettingsRow>
        <SettingsRow label="Tell the partner after">
          <Select
            label="Partner after"
            hideLabel
            defaultValue="3"
            onValueChange={onChange}
            options={[
              { value: "3", label: "3 days" },
              { value: "5", label: "5 days" },
              { value: "7", label: "7 days" },
            ]}
          />
        </SettingsRow>
      </SettingsSection>
    </>
  );
}

/** Settings → Organisation, with the save bar once something changes. */
export const Organisation: Story = {
  render: function Render() {
    const [section, setSection] = useState("org");
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    return (
      <DemoShell active="settings">
        <SettingsPageTemplate
          title="Settings"
          subtitle="Mehta Iyer & Associates · 5 people · hosted"
          sections={settingsSections}
          activeSection={section}
          onSectionChange={setSection}
          dirty={dirty}
          saving={saving}
          onDiscard={() => setDirty(false)}
          onSave={() => {
            setSaving(true);
            setTimeout(() => {
              setSaving(false);
              setDirty(false);
            }, 800);
          }}
        >
          <OrganisationForm onChange={() => setDirty(true)} />
        </SettingsPageTemplate>
      </DemoShell>
    );
  },
};

export const UnsavedChanges: Story = {
  render: () => (
    <DemoShell active="settings">
      <SettingsPageTemplate
        title="Settings"
        sections={settingsSections}
        activeSection="org"
        dirty
        onSave={() => {}}
        onDiscard={() => {}}
      >
        <OrganisationForm onChange={() => {}} />
      </SettingsPageTemplate>
    </DemoShell>
  ),
};
