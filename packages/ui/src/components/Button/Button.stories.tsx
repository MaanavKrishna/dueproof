import { AddIcon, ChevronDownIcon, DownloadIcon, TrashIcon } from "@dueproof/icons";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Row, Section } from "../../stories/helpers";
import { Button, type ButtonVariant } from "./Button";

const meta = {
  title: "Actions/Button",
  component: Button,
  args: { children: "Mark as replied", variant: "primary", size: "md" },
  argTypes: {
    variant: {
      control: "inline-radio",
      options: ["primary", "secondary", "tertiary", "plain", "ghost", "destructive"],
    },
    size: { control: "inline-radio", options: ["sm", "md", "lg"] },
  },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

const variants: ButtonVariant[] = [
  "primary",
  "secondary",
  "tertiary",
  "plain",
  "ghost",
  "destructive",
];

export const AllStates: Story = {
  render: () => (
    <>
      {variants.map((v) => (
        <Section key={v} title={v}>
          <Row>
            <Button variant={v}>Default</Button>
            <Button variant={v} icon={v === "destructive" ? TrashIcon : AddIcon}>
              With icon
            </Button>
            <Button variant={v} iconEnd={ChevronDownIcon}>
              Menu
            </Button>
            <Button variant={v} loading>
              Loading
            </Button>
            <Button variant={v} disabled>
              Disabled
            </Button>
            <Button variant={v} icon={DownloadIcon} aria-label="Download" />
          </Row>
        </Section>
      ))}
    </>
  ),
};

export const Sizes: Story = {
  render: () => (
    <Row>
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg" variant="primary">
        Large
      </Button>
    </Row>
  ),
};

export const FullWidth: Story = { args: { fullWidth: true, children: "Upload notice" } };
