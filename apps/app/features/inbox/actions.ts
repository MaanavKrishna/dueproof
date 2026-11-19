"use server";
/**
 * Inbox actions: open a case from a document, file it into an existing one,
 * set it aside as not a notice (and put it back), or agree nothing is owed.
 */
import type { z } from "zod";
import { type ActionResult, runAction } from "@/lib/action";
import { authorize } from "@/lib/authorize";
import {
  type CreateCaseInput,
  createCaseFromDocument,
  type LinkInput,
  linkDocument,
} from "@/lib/cases";
import { type DocumentOutcome, markNothingOwed, putBack, setAside } from "./discard";

type Filed = { caseId: string; appealWindow: unknown };

export async function openCase(
  input: z.input<typeof CreateCaseInput>,
): Promise<ActionResult<Filed>> {
  return runAction(async () => {
    const ctx = await authorize(
      "case.create",
      input.clientId ? { resource: { clientId: input.clientId } } : {},
    );
    if (input.newClientName) await authorize("client.edit");
    return createCaseFromDocument(ctx, input);
  });
}

export async function fileInCase(input: z.input<typeof LinkInput>): Promise<ActionResult<Filed>> {
  return runAction(async () => linkDocument(await authorize("case.edit"), input));
}

/** "Not a notice": reversible, audited, never a delete. */
export async function setAsideDocument(documentId: string): Promise<ActionResult<DocumentOutcome>> {
  return runAction(async () => setAside(await authorize("finding.review"), documentId));
}

/** Undo "Not a notice". */
export async function putBackDocument(documentId: string): Promise<ActionResult<DocumentOutcome>> {
  return runAction(async () => putBack(await authorize("finding.review"), documentId));
}

/** Nothing was found and nothing is owed: the document leaves the review queue. */
export async function nothingOwed(
  documentId: string,
  undo = false,
): Promise<ActionResult<DocumentOutcome>> {
  return runAction(async () =>
    markNothingOwed(await authorize("finding.review"), documentId, undo),
  );
}
