import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Checkbox } from "../components/Checkbox/Checkbox";
import { FileDropZone } from "../components/FileDropZone/FileDropZone";
import { Radio, RadioGroup } from "../components/Radio/Radio";
import { Select } from "../components/Select/Select";
import { TextArea } from "../components/TextArea/TextArea";
import { TextField } from "../components/TextField/TextField";
import { Wordmark } from "../stories/shell";
import { type WizardStep, WizardTemplate } from "./WizardTemplate";

const meta: Meta<typeof WizardTemplate> = {
  title: "Templates/Wizard",
  component: WizardTemplate,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof WizardTemplate>;

const steps: WizardStep[] = [
  {
    id: "admin",
    label: "Your account",
    title: "Create the admin account",
    description: "You'll manage the firm's settings, people and backups.",
  },
  {
    id: "org",
    label: "Organisation",
    title: "Name your organisation",
    description: "It appears on reports. You can change it later.",
  },
  {
    id: "profiles",
    label: "Notice types",
    title: "Which notices do you handle?",
    description: "Dueproof turns on the matching rules and statutory calendars.",
  },
  {
    id: "ai",
    label: "AI",
    title: "Choose how AI is used",
    description: "AI is off by default. Rules read every notice either way.",
  },
  {
    id: "team",
    label: "Invite your team",
    title: "Invite your team",
    description: "They get an email with a sign-in link.",
  },
  {
    id: "first",
    label: "First notice",
    title: "Upload your first notice",
    description: "We'll read it and show you each date on its page.",
  },
];

function StepBody({
  step,
  name,
  setName,
}: {
  step: number;
  name: string;
  setName: (v: string) => void;
}) {
  switch (steps[step]?.id) {
    case "admin":
      return (
        <>
          <TextField label="Full name" defaultValue="Priya Sharma" autoComplete="name" />
          <TextField
            label="Work email"
            type="email"
            defaultValue="priya@mehtaiyer.in"
            autoComplete="email"
          />
          <TextField
            label="Password"
            type="password"
            description="At least 12 characters. A passkey can be added later."
          />
        </>
      );
    case "org":
      return (
        <>
          <TextField
            label="Organisation name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Select
            label="Financial year"
            defaultValue="apr"
            options={[
              { value: "apr", label: "April – March (India)" },
              { value: "jan", label: "January – December" },
            ]}
          />
          <Select
            label="State (for holidays)"
            defaultValue="mh"
            options={[
              { value: "mh", label: "Maharashtra" },
              { value: "ka", label: "Karnataka" },
              { value: "gj", label: "Gujarat" },
            ]}
          />
        </>
      );
    case "profiles":
      return (
        <>
          <Checkbox
            label="GST"
            description="ASMT-10, DRC-01, REG-17 and others; GSTR-1, 3B and 9 calendar"
            defaultChecked
          />
          <Checkbox
            label="Income tax"
            description="143(1), 142(1), 148A, 156; advance tax and ITR calendar"
            defaultChecked
          />
          <Checkbox
            label="TDS"
            description="200A intimations; TDS payments and returns"
            defaultChecked
          />
          <Checkbox label="ROC / MCA" description="Adjudication notices; AOC-4 and MGT-7" />
          <Checkbox label="Courts and tribunals" description="Hearing notices and orders" />
        </>
      );
    case "ai":
      return (
        <RadioGroup label="AI mode" defaultValue="off">
          <Radio value="off" label="Off" description="Rules only. Nothing leaves your server." />
          <Radio
            value="local"
            label="Local"
            description="A model on this machine. Slower; private."
          />
          <Radio
            value="byok"
            label="Your own key"
            description="Anthropic or another provider, billed to you."
          />
          <Radio
            value="plan"
            label="Dueproof plan"
            description="Included allowance; hosted only."
          />
        </RadioGroup>
      );
    case "team":
      return (
        <TextArea
          label="Email addresses"
          description="One per line."
          defaultValue={"rahul@mehtaiyer.in\nananya@mehtaiyer.in"}
        />
      );
    default:
      return (
        <FileDropZone
          onFiles={() => {}}
          accept=".pdf,image/*"
          description="PDF, JPG or PNG, up to 50 MB."
          size="lg"
        />
      );
  }
}

/** First run on a self-hosted install: six steps from no users to a first notice. */
export const FirstRun: Story = {
  render: function Render() {
    const [current, setCurrent] = useState(1);
    const [name, setName] = useState("Mehta Iyer & Associates");
    const [busy, setBusy] = useState(false);
    return (
      <WizardTemplate
        title="Set up Dueproof"
        brand={<Wordmark />}
        steps={steps}
        current={current}
        onBack={() => setCurrent((c) => Math.max(0, c - 1))}
        onNext={() => {
          setBusy(true);
          setTimeout(() => {
            setBusy(false);
            setCurrent((c) => Math.min(steps.length - 1, c + 1));
          }, 400);
        }}
        onCancel={() => {}}
        onSkip={steps[current]?.id === "team" ? () => setCurrent((c) => c + 1) : undefined}
        canProceed={steps[current]?.id !== "org" || name.trim().length > 1}
        busy={busy}
        aside={
          <>
            <strong>Self-hosted</strong>
            <p>Everything stays on this server. You can change any of this in Settings.</p>
          </>
        }
      >
        <StepBody step={current} name={name} setName={setName} />
      </WizardTemplate>
    );
  },
};

export const LastStep: Story = {
  render: () => (
    <WizardTemplate
      title="Set up Dueproof"
      brand={<Wordmark />}
      steps={steps}
      current={5}
      onBack={() => {}}
      onNext={() => {}}
    >
      <StepBody step={5} name="" setName={() => {}} />
    </WizardTemplate>
  ),
};

export const StepFailed: Story = {
  render: () => (
    <WizardTemplate
      title="Set up Dueproof"
      steps={steps.map((s) =>
        s.id === "ai"
          ? {
              ...s,
              error: true,
              description:
                "Couldn't reach the provider with that key. Check it, or choose Off for now.",
            }
          : s,
      )}
      current={3}
      onBack={() => {}}
      onNext={() => {}}
      canProceed={false}
    >
      <StepBody step={3} name="" setName={() => {}} />
    </WizardTemplate>
  ),
};
