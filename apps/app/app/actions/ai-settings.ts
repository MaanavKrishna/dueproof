"use server";
/**
 * Server actions for Settings → AI (04 §2, §6, §7). Each needs
 * `ai.manage_settings` (owners and admins) and each change is audited.
 * The provider key goes in through `setAiKey` and never comes back out:
 * `getAiSettings` returns only its last four characters.
 *
 *   const res = await getAiSettings();
 *   await saveAiSettings({ mode: "byok", provider: "anthropic", routing: {}, … });
 *   await setAiKey(key);   // { keyLast4 }
 *   await clearAiKey();
 */
import {
  type AiSettingsInput,
  type AiSettingsView,
  clearAiKeyFor,
  getAiSettingsView,
  saveAiSettingsFor,
  setAiKeyFor,
} from "@/lib/ai-settings";
import { authorize } from "@/lib/authorize";
import { HttpError } from "@/lib/errors";
import type { ActionResult } from "./upload";

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof HttpError) return { ok: false, error: e.code, message: e.message };
    // Name only: a message could echo the key.
    console.error("ai settings action failed", e instanceof Error ? e.name : typeof e);
    return { ok: false, error: "internal", message: "Something went wrong." };
  }
}

export async function getAiSettings(): Promise<ActionResult<AiSettingsView>> {
  return run(async () => getAiSettingsView(await authorize("ai.manage_settings")));
}

export async function saveAiSettings(
  input: AiSettingsInput,
): Promise<ActionResult<AiSettingsView>> {
  return run(async () => saveAiSettingsFor(await authorize("ai.manage_settings"), input));
}

export async function setAiKey(plainKey: string): Promise<ActionResult<{ keyLast4: string }>> {
  return run(async () => setAiKeyFor(await authorize("ai.manage_settings"), plainKey));
}

export async function clearAiKey(): Promise<ActionResult<{ cleared: boolean }>> {
  return run(async () => clearAiKeyFor(await authorize("ai.manage_settings")));
}
