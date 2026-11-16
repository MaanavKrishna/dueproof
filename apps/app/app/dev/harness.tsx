"use client";

import { type FormEvent, useState } from "react";
import { finishUpload, startUpload } from "../actions/upload";

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function authCall(path: string, body: Record<string, string>) {
  const res = await fetch(`/api/auth/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return `${res.status} ${JSON.stringify(json).slice(0, 300)}`;
}

export function DevHarness() {
  const [log, setLog] = useState<string[]>([]);
  const [detail, setDetail] = useState<string>("");
  const add = (line: string) => setLog((l) => [...l, line]);

  async function onAuth(e: FormEvent<HTMLFormElement>, mode: "sign-up" | "sign-in") {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email"));
    const password = String(f.get("password"));
    const result =
      mode === "sign-up"
        ? await authCall("sign-up/email", { email, password, name: String(f.get("name") || email) })
        : await authCall("sign-in/email", { email, password });
    add(`${mode}: ${result}`);
  }

  async function onUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = (new FormData(e.currentTarget).get("file") as File | null) ?? null;
    if (!file?.size) return;
    const init = await startUpload({
      filename: file.name,
      size: file.size,
      mime: file.type || "application/pdf",
      sha256: await sha256Hex(file),
    });
    if (!init.ok) return add(`init: ${init.error} ${init.message}`);
    add(`init: ${init.data.status} ${init.data.documentId}`);
    const id = init.data.documentId;
    if (init.data.status === "upload") {
      const put = await fetch(init.data.upload.url, {
        method: "PUT",
        headers: init.data.upload.headers,
        body: file,
      });
      add(`put: ${put.status}`);
      const done = await finishUpload(id);
      add(
        `complete: ${done.ok ? `${done.data.status} run=${done.data.runId ?? "-"}` : done.message}`,
      );
    }
    const events = new EventSource(`/api/v1/documents/${id}/events`);
    events.addEventListener("status", async (ev) => {
      const data = JSON.parse((ev as MessageEvent<string>).data) as {
        status: string;
        detail?: string;
      };
      add(`status: ${data.status}${data.detail ? ` (${data.detail})` : ""}`);
      if (["ready", "needs_review", "failed", "quarantined"].includes(data.status)) {
        events.close();
        const res = await fetch(`/api/v1/documents/${id}`);
        setDetail(JSON.stringify(await res.json(), null, 2));
      }
    });
    events.onerror = () => events.close();
  }

  return (
    <div>
      <section>
        <h2>Sign up</h2>
        <form onSubmit={(e) => onAuth(e, "sign-up")}>
          <input name="name" placeholder="Name" />
          <input name="email" type="email" placeholder="Email" required />
          <input
            name="password"
            type="password"
            placeholder="Password (10+)"
            required
            minLength={10}
          />
          <button type="submit">Sign up</button>
        </form>
        <h2>Sign in</h2>
        <form onSubmit={(e) => onAuth(e, "sign-in")}>
          <input name="email" type="email" placeholder="Email" required />
          <input name="password" type="password" placeholder="Password" required />
          <button type="submit">Sign in</button>
        </form>
      </section>
      <section>
        <h2>Upload</h2>
        <form onSubmit={onUpload}>
          <input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/tiff" />
          <button type="submit">Upload</button>
        </form>
      </section>
      <section>
        <h2>Log</h2>
        <pre>{log.join("\n")}</pre>
        <h2>Result</h2>
        <pre>{detail}</pre>
      </section>
    </div>
  );
}
