import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "../../stories/helpers";
import { LanguageIndicator } from "./LanguageIndicator";

const meta = {
  title: "Dueproof/LanguageIndicator",
  component: LanguageIndicator,
  args: { language: "Hindi", onShowOriginal: () => {} },
} satisfies Meta<typeof LanguageIndicator>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Translated: Story = {};
export const Warn: Story = { args: { state: "warn", detail: "Low confidence on page 2" } };
export const Unavailable: Story = {
  args: {
    language: "Kashmiri",
    state: "unavailable",
    detail: "Turn on AI for this notice to translate it",
  },
};
export const AllStates: Story = {
  render: () => (
    <Stack>
      <LanguageIndicator language="Tamil" onShowOriginal={() => {}} />
      <LanguageIndicator language="Marathi" state="warn" onShowOriginal={() => {}} />
      <LanguageIndicator language="Urdu" state="unavailable" />
      <LanguageIndicator language="Gujarati" size="sm" detail="Translated on this device" />
    </Stack>
  ),
};
