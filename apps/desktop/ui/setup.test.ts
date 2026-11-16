import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, expect, describe as group, it, vi } from "vitest";
import { describe, type Invoke, mount, quickCheck, type Report, type SettingsView } from "./setup";

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "index.html"), "utf8");

const baseSettings: SettingsView = {
  serverUrl: null,
  autostart: false,
  updatesEnabled: false,
  updatesLocked: false,
  updatesConfigured: false,
  platform: "linux",
  appVersion: "0.1.0",
};

const okReport: Report = {
  ok: true,
  tone: "success",
  message: "Connected. The server is working.",
  origin: "https://dueproof.example.com",
  serverVersion: "0.1.0",
  edition: "self-hosted",
};

function fakeInvoke(handlers: Record<string, (args?: Record<string, unknown>) => unknown>) {
  const calls: Array<[string, Record<string, unknown> | undefined]> = [];
  const invoke: Invoke = async <T>(cmd: string, args?: Record<string, unknown>) => {
    calls.push([cmd, args]);
    const h = handlers[cmd];
    if (!h) throw new Error(`unexpected ${cmd}`);
    return (await h(args)) as T;
  };
  return { invoke, calls };
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  document.documentElement.innerHTML = html.replace(/^<!doctype html>/i, "");
});

group("quickCheck", () => {
  it("asks for an address when the box is empty", () => {
    expect(quickCheck("   ")).toMatch(/Enter your Dueproof server/);
  });
  it("refuses spaces inside the address", () => {
    expect(quickCheck("dueproof example.com")).toMatch(/doesn't look like a web address/);
  });
  it("leaves real checks to the shell", () => {
    expect(quickCheck("http://anything")).toBeNull();
  });
});

group("describe", () => {
  it("adds the edition and version on success", () => {
    expect(describe(okReport).text).toBe(
      "Connected. The server is working. (your own server, version 0.1.0)",
    );
  });
  it("shows a refusal as it came", () => {
    expect(describe({ ok: false, tone: "danger", message: "Use an https:// address." })).toEqual({
      text: "Use an https:// address.",
      tone: "danger",
    });
  });
});

group("mount", () => {
  it("shows saved settings and the platform", async () => {
    const { invoke } = fakeInvoke({
      get_settings: () => ({
        ...baseSettings,
        serverUrl: "https://dueproof.example.com",
        autostart: true,
        platform: "windows",
      }),
    });
    await mount(document, invoke);
    expect($<HTMLInputElement>("server-url").value).toBe("https://dueproof.example.com");
    expect($<HTMLInputElement>("autostart").checked).toBe(true);
    expect($("cancel").hidden).toBe(false);
    expect(document.documentElement.dataset.platform).toBe("windows");
    expect($("version").textContent).toContain("0.1.0");
    expect($("updates-note").textContent).toMatch(/no update channel/);
  });

  it("doesn't call the shell for an empty address", async () => {
    const { invoke, calls } = fakeInvoke({ get_settings: () => baseSettings });
    await mount(document, invoke);
    $<HTMLFormElement>("connect-form").requestSubmit();
    await flush();
    expect(calls.map(([c]) => c)).toEqual(["get_settings"]);
    expect($("status").textContent).toMatch(/Enter your Dueproof server/);
    expect($("status").dataset.tone).toBe("danger");
    expect($("server-url").getAttribute("aria-invalid")).toBe("true");
  });

  it("connects with the trimmed address and shows the shell's answer", async () => {
    const { invoke, calls } = fakeInvoke({
      get_settings: () => baseSettings,
      connect: () => okReport,
    });
    await mount(document, invoke);
    $<HTMLInputElement>("server-url").value = "  dueproof.example.com  ";
    $<HTMLFormElement>("connect-form").requestSubmit();
    await flush();
    expect(calls[1]).toEqual(["connect", { url: "dueproof.example.com" }]);
    expect($("status").dataset.tone).toBe("success");
    expect($<HTMLInputElement>("server-url").value).toBe("https://dueproof.example.com");
    expect($<HTMLButtonElement>("connect").disabled).toBe(false);
  });

  it("Check only checks", async () => {
    const { invoke, calls } = fakeInvoke({
      get_settings: () => baseSettings,
      check_server: () => ({
        ok: false,
        tone: "danger",
        message: "That address answered, but it isn't a Dueproof server.",
      }),
    });
    await mount(document, invoke);
    $<HTMLInputElement>("server-url").value = "https://example.com";
    $("check").click();
    await flush();
    expect(calls.map(([c]) => c)).toEqual(["get_settings", "check_server"]);
    expect($("status").textContent).toMatch(/isn't a Dueproof server/);
  });

  it("shows a thrown error and re-enables the buttons", async () => {
    const { invoke } = fakeInvoke({
      get_settings: () => baseSettings,
      connect: () => Promise.reject("Couldn't save the server address."),
    });
    await mount(document, invoke);
    $<HTMLInputElement>("server-url").value = "https://dueproof.example.com";
    $<HTMLFormElement>("connect-form").requestSubmit();
    await flush();
    expect($("status").textContent).toBe("Couldn't save the server address.");
    expect($<HTMLButtonElement>("connect").disabled).toBe(false);
  });

  it("puts a checkbox back when the shell refuses", async () => {
    const set = vi.fn(() =>
      Promise.reject("Your administrator manages updates for this computer."),
    );
    const { invoke } = fakeInvoke({ get_settings: () => baseSettings, set_updates: set });
    await mount(document, invoke);
    const box = $<HTMLInputElement>("updates");
    box.click();
    await flush();
    expect(set).toHaveBeenCalledWith({ enabled: true });
    expect(box.checked).toBe(false);
    expect($("status").textContent).toMatch(/administrator/);
  });

  it("locks the updates box for managed installs", async () => {
    const { invoke } = fakeInvoke({
      get_settings: () => ({ ...baseSettings, updatesLocked: true }),
    });
    await mount(document, invoke);
    expect($<HTMLInputElement>("updates").disabled).toBe(true);
    expect($("updates-note").textContent).toMatch(/administrator/);
  });
});
