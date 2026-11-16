import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tab, TabList, TabPanel, Tabs } from "./Tabs";

const meta = {
  title: "Navigation/Tabs",
  component: Tabs,
} satisfies Meta<typeof Tabs>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  render: () => (
    <Tabs defaultValue="summary" style={{ maxWidth: "640px" }}>
      <TabList aria-label="Notice">
        <Tab value="summary">Summary</Tab>
        <Tab value="findings" count={6}>
          Findings
        </Tab>
        <Tab value="activity">Activity</Tab>
        <Tab value="audit" disabled>
          Audit log
        </Tab>
      </TabList>
      <TabPanel value="summary">GST ASMT-10 for FY 2024–25. Reply due 20 Nov 2026.</TabPanel>
      <TabPanel value="findings">Six findings, four verified on the page.</TabPanel>
      <TabPanel value="activity">R. Mehta assigned this to you.</TabPanel>
    </Tabs>
  ),
};
