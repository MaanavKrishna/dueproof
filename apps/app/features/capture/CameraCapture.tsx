"use client";
/**
 * Camera capture on phones (01 §4): the browser's file input with
 * `capture="environment"` opens the camera; each photo or PDF goes through
 * the same upload actions as any file (hash, signed PUT, complete) and lands
 * in the Inbox. No standing camera permission is asked for.
 */
import { CameraIcon, UploadIcon } from "@dueproof/icons";
import {
  Button,
  ListPageTemplate,
  type UploadItem,
  UploadTray,
  VisuallyHidden,
} from "@dueproof/ui";
import { type ReactNode, useRef, useState } from "react";
import { finishUpload, startUpload } from "@/app/actions/upload";
import styles from "./capture.module.css";

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function CameraCapture({ banner }: { banner?: ReactNode }) {
  const camera = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const update = (id: string, patch: Partial<UploadItem>) =>
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  async function send(file: File) {
    const id = `${file.name}-${file.size}-${Date.now()}`;
    setItems((xs) => [
      ...xs,
      { id, name: file.name || "Photo", size: file.size, stage: "uploading", progress: 0 },
    ]);
    try {
      const init = await startUpload({
        filename:
          file.name || `photo-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.jpg`,
        size: file.size,
        mime: file.type || "image/jpeg",
        sha256: await sha256Hex(file),
      });
      if (!init.ok) return update(id, { stage: "failed", error: init.message });
      if (init.data.status === "duplicate")
        return update(id, { stage: "duplicate", detail: "Already in the register" });
      if (init.data.status === "upload") {
        const put = await fetch(init.data.upload.url, {
          method: "PUT",
          headers: init.data.upload.headers,
          body: file,
        });
        if (!put.ok)
          return update(id, { stage: "failed", error: "The upload didn't finish. Try again." });
      }
      update(id, { stage: "reading", progress: 1 });
      const done = await finishUpload(init.data.documentId);
      if (!done.ok) return update(id, { stage: "failed", error: done.message });
      update(id, { stage: "done" });
    } catch {
      update(id, {
        stage: "failed",
        error: "No connection. Nothing was saved; try again when you're online.",
      });
    }
  }

  function onPick(list: FileList | null) {
    for (const f of Array.from(list ?? [])) void send(f);
  }

  return (
    <ListPageTemplate
      title="Capture"
      width="narrow"
      subtitle="Photograph a notice; it goes to the Inbox to be read"
      scrollPage
    >
      <div className={styles.body}>
        {banner}
        <Button
          size="lg"
          variant="primary"
          icon={CameraIcon}
          fullWidth
          onClick={() => camera.current?.click()}
        >
          Take a photo
        </Button>
        <Button size="lg" icon={UploadIcon} fullWidth onClick={() => files.current?.click()}>
          Choose a file or PDF
        </Button>
        <VisuallyHidden>
          <input
            ref={camera}
            type="file"
            tabIndex={-1}
            accept="image/*,application/pdf"
            capture="environment"
            aria-label="Take a photo of a notice"
            onChange={(e) => {
              onPick(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={files}
            type="file"
            tabIndex={-1}
            accept="image/*,application/pdf"
            multiple
            aria-label="Choose files"
            onChange={(e) => {
              onPick(e.target.files);
              e.target.value = "";
            }}
          />
        </VisuallyHidden>
        <p className={styles.hint}>
          Lay the page flat in good light and fill the frame. Each page can be a separate photo. The
          photo is checked like any upload and kept as the original.
        </p>
        {items.length ? <UploadTray items={items} /> : null}
      </div>
    </ListPageTemplate>
  );
}
