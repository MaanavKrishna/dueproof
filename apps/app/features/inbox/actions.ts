"use server";
/** Inbox actions: open a case from a document, or file it into an existing one. */
import type { z } from "zod";
import { type ActionResult, runAction } from "@/lib/action";
import { authorize } from "@/lib/authorize";
import {
  type CreateCaseInput,
  createCaseFromDocument,
  type LinkInput,
  linkDocument,
} from "@/lib/cases";

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

/** The case's and the document's clients are checked in linkDocument, once the rows are loaded. */
export async function fileInCase(input: z.input<typeof LinkInput>): Promise<ActionResult<Filed>> {
  return runAction(async () => linkDocument(await authorize("case.edit"), input));
}
