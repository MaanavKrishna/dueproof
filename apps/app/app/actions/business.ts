"use server";
/**
 * Server actions for Business features: the licence (Settings → System,
 * owners only: `billing.manage`) and single sign-on (Settings → Team,
 * `team.manage`). Without ee/ they answer that this build has none.
 */
import type { LicenceStatus, SsoProviderView } from "@dueproof/plugins";
import { headers } from "next/headers";
import { type ActionResult, runAction } from "@/lib/action-result";
import { authorize } from "@/lib/authorize";
import { removeSsoFor, saveSsoFor } from "@/lib/business";
import { badRequest } from "@/lib/errors";
import { installLicenceFor, removeLicenceFor } from "@/lib/licence";

export async function installLicence(text: string): Promise<ActionResult<LicenceStatus>> {
  return runAction("licence install", async () => {
    const ctx = await authorize("billing.manage");
    if (typeof text !== "string" || !text.trim()) throw badRequest("Paste the licence file.");
    return installLicenceFor(ctx, text);
  });
}

export async function removeLicence(): Promise<ActionResult<LicenceStatus>> {
  return runAction("licence remove", async () =>
    removeLicenceFor(await authorize("billing.manage")),
  );
}

export async function saveSso(input: unknown): Promise<ActionResult<SsoProviderView>> {
  return runAction("sso save", async () => {
    const ctx = await authorize("team.manage");
    return saveSsoFor(ctx, input, new Headers(await headers()));
  });
}

export async function removeSso(providerId: string): Promise<ActionResult<{ removed: true }>> {
  return runAction("sso remove", async () => {
    await removeSsoFor(await authorize("team.manage"), providerId);
    return { removed: true as const };
  });
}
