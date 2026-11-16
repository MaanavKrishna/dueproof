"use server";
/**
 * Confirm, edit, dismiss and restore a finding: the Inbox review queue and
 * the case page share these. Logic and the append-only edit trail are in
 * lib/findings.
 */
import type { z } from "zod";
import { type ActionResult, runAction } from "@/lib/action";
import { authorize } from "@/lib/authorize";
import {
  confirmFinding as confirm,
  type DismissInput,
  dismissFinding as dismiss,
  type EditInput,
  editFinding as edit,
  type ReviewOutcome,
  restoreFinding as restore,
} from "@/lib/findings";

export async function confirmFinding(findingId: string): Promise<ActionResult<ReviewOutcome>> {
  return runAction(async () => confirm(await authorize("finding.review"), findingId));
}

export async function dismissFinding(
  input: z.input<typeof DismissInput>,
): Promise<ActionResult<ReviewOutcome>> {
  return runAction(async () => dismiss(await authorize("finding.review"), input));
}

export async function restoreFinding(findingId: string): Promise<ActionResult<ReviewOutcome>> {
  return runAction(async () => restore(await authorize("finding.review"), findingId));
}

export async function editFinding(
  input: z.input<typeof EditInput>,
): Promise<ActionResult<ReviewOutcome>> {
  return runAction(async () => edit(await authorize("finding.review"), input));
}
