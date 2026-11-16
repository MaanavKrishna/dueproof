import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { uploads } from "../../stories/fixtures";
import { Stack } from "../../stories/helpers";
import { Banner } from "../Banner/Banner";
import { FileDropZone, type FileRejection } from "./FileDropZone";
import { type UploadItem, UploadTray } from "./UploadTray";

const meta = {
  title: "Structure/FileDropZone",
  component: FileDropZone,
  args: {
    onFiles: () => {},
    accept: ".pdf,image/*",
    maxSize: 50 * 1024 * 1024,
    description: "PDF, JPG or PNG, up to 50 MB each. Folders work too.",
  },
} satisfies Meta<typeof FileDropZone>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Large: Story = { args: { size: "lg", camera: true } };
export const Disabled: Story = { args: { disabled: true, title: "Uploads are paused" } };

export const WithTray: Story = {
  render: function Render(args) {
    const [items, setItems] = useState<UploadItem[]>(uploads);
    const [rejected, setRejected] = useState<FileRejection[]>([]);
    return (
      <Stack width="40rem">
        <FileDropZone
          {...args}
          onReject={setRejected}
          onFiles={(files) =>
            setItems((prev) => [
              ...files.map((f, i) => ({
                id: `${Date.now()}-${i}`,
                name: f.name,
                size: f.size,
                stage: "queued" as const,
              })),
              ...prev,
            ])
          }
        />
        {rejected.length ? (
          <Banner
            tone="danger"
            title={`${rejected.length} file${rejected.length > 1 ? "s" : ""} not uploaded`}
            onDismiss={() => setRejected([])}
          >
            {rejected.map((r) => `${r.file.name}: ${r.reason}`).join(" · ")}
          </Banner>
        ) : null}
        <UploadTray
          items={items}
          onRemove={(id) => setItems((p) => p.filter((i) => i.id !== id))}
          onCancel={(id) => setItems((p) => p.filter((i) => i.id !== id))}
          onRetry={() => {}}
          onOpen={() => {}}
          onEnterPassword={() => {}}
          onClearDone={() => setItems((p) => p.filter((i) => i.stage !== "done"))}
        />
      </Stack>
    );
  },
};

export const TrayCollapsed: StoryObj<typeof UploadTray> = {
  render: () => <UploadTray items={uploads.slice(1, 3)} defaultCollapsed />,
};
