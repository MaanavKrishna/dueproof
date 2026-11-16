/**
 * The setup screen: first launch and "Change server". All checks that
 * matter happen in the shell (src-tauri/src/origin.rs and health.rs); this
 * script only gathers input and shows the answers. `invoke` is passed in so
 * tests can drive the screen without Tauri.
 */

export type Tone = "success" | "warning" | "danger";

export interface Report {
  ok: boolean;
  tone: Tone;
  message: string;
  origin?: string | null;
  serverVersion?: string | null;
  edition?: string | null;
}

export interface SettingsView {
  serverUrl: string | null;
  autostart: boolean;
  updatesEnabled: boolean;
  updatesLocked: boolean;
  updatesConfigured: boolean;
  platform: "macos" | "windows" | "linux";
  appVersion: string;
}

export type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

/** A quick check before asking the shell, so an empty box gets an instant answer. */
export function quickCheck(input: string): string | null {
  const s = input.trim();
  if (!s) return "Enter your Dueproof server's address.";
  if (/\s/.test(s)) return "That doesn't look like a web address.";
  return null;
}

const EDITIONS: Record<string, string> = {
  hosted: "Dueproof hosted",
  "self-hosted": "your own server",
  desktop: "this computer",
};

/** The status line under the address, from the shell's report. */
export function describe(report: Report): { text: string; tone: Tone } {
  const extra =
    report.ok && report.edition
      ? ` (${EDITIONS[report.edition] ?? report.edition}${report.serverVersion ? `, version ${report.serverVersion}` : ""})`
      : "";
  return { text: `${report.message}${extra}`, tone: report.tone };
}

function errorText(e: unknown): string {
  if (typeof e === "string" && e) return e;
  if (e instanceof Error && e.message) return e.message;
  return "Something went wrong. Try again.";
}

function el<T extends HTMLElement>(doc: Document, id: string): T {
  const found = doc.getElementById(id);
  if (!found) throw new Error(`missing #${id}`);
  return found as T;
}

/** Wires the screen up. Returns once the saved settings are shown. */
export async function mount(doc: Document, invoke: Invoke): Promise<void> {
  const form = el<HTMLFormElement>(doc, "connect-form");
  const input = el<HTMLInputElement>(doc, "server-url");
  const status = el<HTMLParagraphElement>(doc, "status");
  const check = el<HTMLButtonElement>(doc, "check");
  const connect = el<HTMLButtonElement>(doc, "connect");
  const cancel = el<HTMLButtonElement>(doc, "cancel");
  const autostart = el<HTMLInputElement>(doc, "autostart");
  const updates = el<HTMLInputElement>(doc, "updates");
  const updatesNote = el<HTMLElement>(doc, "updates-note");
  const version = el<HTMLElement>(doc, "version");

  const show = (text: string, tone: Tone) => {
    status.textContent = text;
    status.dataset.tone = tone;
    status.hidden = false;
    input.setAttribute("aria-invalid", tone === "danger" ? "true" : "false");
  };
  const busy = (on: boolean, label?: string) => {
    for (const b of [check, connect, cancel]) b.disabled = on;
    form.setAttribute("aria-busy", on ? "true" : "false");
    connect.textContent = on && label ? label : "Connect";
  };

  const settings = await invoke<SettingsView>("get_settings");
  doc.documentElement.dataset.platform = settings.platform;
  version.textContent = `Dueproof for desktop ${settings.appVersion}`;
  if (settings.serverUrl) {
    input.value = settings.serverUrl;
    cancel.hidden = false;
  }
  autostart.checked = settings.autostart;
  updates.checked = settings.updatesEnabled;
  updates.disabled = settings.updatesLocked;
  updatesNote.textContent = settings.updatesLocked
    ? "Your administrator manages updates for this computer."
    : settings.updatesConfigured
      ? "Updates are signed. Nothing installs until you say yes."
      : "This build has no update channel yet. Install new versions by hand.";

  async function run(cmd: "check_server" | "connect") {
    const problem = quickCheck(input.value);
    if (problem) {
      show(problem, "danger");
      input.focus();
      return;
    }
    busy(true, cmd === "connect" ? "Connecting…" : undefined);
    show("Checking the server…", "warning");
    try {
      const report = await invoke<Report>(cmd, { url: input.value.trim() });
      const d = describe(report);
      show(d.text, d.tone);
      if (report.ok && report.origin) input.value = report.origin;
      if (!report.ok) input.focus();
    } catch (e) {
      show(errorText(e), "danger");
    } finally {
      busy(false);
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    void run("connect");
  });
  check.addEventListener("click", () => void run("check_server"));
  cancel.addEventListener("click", () => {
    if (settings.serverUrl) {
      input.value = settings.serverUrl;
      void run("connect");
    }
  });

  autostart.addEventListener("change", async () => {
    const wanted = autostart.checked;
    try {
      autostart.checked = await invoke<boolean>("set_autostart", { enabled: wanted });
    } catch (e) {
      autostart.checked = !wanted;
      show(errorText(e), "danger");
    }
  });
  updates.addEventListener("change", async () => {
    const wanted = updates.checked;
    try {
      updates.checked = await invoke<boolean>("set_updates", { enabled: wanted });
    } catch (e) {
      updates.checked = !wanted;
      show(errorText(e), "danger");
    }
  });

  input.focus();
}
