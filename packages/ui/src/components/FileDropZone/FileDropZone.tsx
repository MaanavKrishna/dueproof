import { CameraIcon, FolderIcon, UploadIcon } from "@dueproof/icons";
import { type ChangeEvent, type DragEvent, type ReactNode, useId, useRef, useState } from "react";
import { cx } from "../../utils/cx";
import { Button } from "../Button/Button";
import styles from "./FileDropZone.module.css";

export interface FileRejection {
  file: File;
  /** Plain words: "Larger than 50 MB", "Not a PDF or image". */
  reason: string;
}

export interface FileDropZoneProps {
  /** Accepted files, in the order dropped (folders are walked). */
  onFiles: (files: File[]) => void;
  /** Files that failed the checks below, with reasons. */
  onReject?: (rejections: FileRejection[]) => void;
  /** Like the input's accept: ".pdf,image/*". */
  accept?: string;
  /** Largest file, in bytes. */
  maxSize?: number;
  multiple?: boolean;
  /** Offer "Choose folder" and walk dropped folders. Default true. */
  folders?: boolean;
  /** Offer "Take photo" (opens the camera on phones). */
  camera?: boolean;
  disabled?: boolean;
  title?: ReactNode;
  /** The limits, in words: "PDF, JPG or PNG, up to 50 MB each". */
  description?: ReactNode;
  size?: "md" | "lg";
  className?: string;
}

function matchesAccept(file: File, accept?: string): boolean {
  if (!accept) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return accept
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean)
    .some((a) =>
      a.startsWith(".")
        ? name.endsWith(a)
        : a.endsWith("/*")
          ? type.startsWith(a.slice(0, -1))
          : type === a,
    );
}

function formatLimit(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${Math.round(mb)} MB` : `${Math.round(bytes / 1024)} KB`;
}

type Entry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (cb: (f: File) => void, err?: (e: unknown) => void) => void;
  createReader?: () => {
    readEntries: (cb: (entries: Entry[]) => void, err?: (e: unknown) => void) => void;
  };
};

async function walk(entry: Entry): Promise<File[]> {
  if (entry.isFile && entry.file) {
    const read = entry.file;
    return new Promise((resolve) =>
      read(
        (f) => resolve([f]),
        () => resolve([]),
      ),
    );
  }
  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    const all: Entry[] = [];
    // readEntries returns batches until it returns an empty one.
    for (;;) {
      const batch = await new Promise<Entry[]>((resolve) =>
        reader.readEntries(resolve, () => resolve([])),
      );
      if (batch.length === 0) break;
      all.push(...batch);
    }
    const nested = await Promise.all(all.filter((e) => !e.name.startsWith(".")).map(walk));
    return nested.flat();
  }
  return [];
}

async function filesFromDrop(e: DragEvent): Promise<File[]> {
  const items = Array.from(e.dataTransfer.items ?? []);
  const entries = items
    .map((i) => (i.kind === "file" ? (i.webkitGetAsEntry?.() as Entry | null) : null))
    .filter((x): x is Entry => x !== null);
  if (entries.length > 0) return (await Promise.all(entries.map(walk))).flat();
  return Array.from(e.dataTransfer.files ?? []);
}

/**
 * Drag files or whole folders here, or choose them. Checks type and size up
 * front and says why a file was refused. The drop target scales and glows
 * while something is dragged over it.
 */
export function FileDropZone({
  onFiles,
  onReject,
  accept,
  maxSize,
  multiple = true,
  folders = true,
  camera = false,
  disabled = false,
  title = "Drop notices here",
  description,
  size = "md",
  className,
}: FileDropZoneProps) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descId = useId();

  const accept_ = (list: File[]) => {
    const files = multiple ? list : list.slice(0, 1);
    const ok: File[] = [];
    const rejected: FileRejection[] = [];
    for (const file of files) {
      if (!matchesAccept(file, accept))
        rejected.push({ file, reason: "This type of file isn't supported" });
      else if (maxSize !== undefined && file.size > maxSize)
        rejected.push({ file, reason: `Larger than ${formatLimit(maxSize)}` });
      else if (file.size === 0) rejected.push({ file, reason: "The file is empty" });
      else ok.push(file);
    }
    if (ok.length) onFiles(ok);
    if (rejected.length) onReject?.(rejected);
  };

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    accept_(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: a labelled group around the drop target, not a form fieldset.
    <div
      className={cx(styles.zone, styles[size], className)}
      data-over={over || undefined}
      data-disabled={disabled || undefined}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      role="group"
      onDragEnter={(e) => {
        if (disabled) return;
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={async (e) => {
        if (disabled) return;
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        accept_(await filesFromDrop(e));
      }}
    >
      <span className={styles.art} aria-hidden="true">
        <UploadIcon size={size === "lg" ? 28 : 22} />
      </span>
      <p id={titleId} className={styles.title}>
        {over ? "Drop to upload" : title}
      </p>
      {description ? (
        <p id={descId} className={styles.description}>
          {description}
        </p>
      ) : null}
      <div className={styles.actions}>
        <Button
          size="sm"
          variant="primary"
          icon={UploadIcon}
          disabled={disabled}
          onClick={() => fileInput.current?.click()}
        >
          Choose files
        </Button>
        {folders ? (
          <Button
            size="sm"
            icon={FolderIcon}
            disabled={disabled}
            onClick={() => folderInput.current?.click()}
          >
            Choose folder
          </Button>
        ) : null}
        {camera ? (
          <Button
            size="sm"
            icon={CameraIcon}
            disabled={disabled}
            className={styles.camera}
            onClick={() => cameraInput.current?.click()}
          >
            Take photo
          </Button>
        ) : null}
      </div>
      <input
        ref={fileInput}
        type="file"
        hidden
        multiple={multiple}
        accept={accept}
        onChange={onInput}
        tabIndex={-1}
        aria-hidden="true"
      />
      {folders ? (
        <input
          ref={folderInput}
          type="file"
          hidden
          multiple
          onChange={onInput}
          tabIndex={-1}
          aria-hidden="true"
          {...{ webkitdirectory: "", directory: "" }}
        />
      ) : null}
      {camera ? (
        <input
          ref={cameraInput}
          type="file"
          hidden
          accept="image/*"
          capture="environment"
          onChange={onInput}
          tabIndex={-1}
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}
