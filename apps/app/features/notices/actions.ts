"use server";
/**
 * Notices: saved views, bulk assign and stage (audited per case, with undo),
 * and CSV export of the current view.
 */
import { Id } from "@dueproof/contracts";
import { and, audit, cases, eq, inArray, savedViews, uuidv7, withOrg } from "@dueproof/db";
import { z } from "zod";
import { type ActionResult, runAction } from "@/lib/action";
import { authorize } from "@/lib/authorize";
import { clientAllowed, requireClient } from "@/lib/client-access";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { loadPeople } from "@/lib/org";
import { enforce } from "@/lib/rate-limit";
import { moveStage, STAGES } from "@/lib/stages";
import { applyFilters, toCsv } from "./model";
import { loadNoticeRows } from "./queries";

const FiltersSchema = z.record(z.string().max(40), z.array(z.string().max(200)).max(100));

const SaveViewInput = z.object({
  name: z.string().trim().min(1, "Name the view.").max(80),
  filters: FiltersSchema,
  shared: z.boolean().default(false),
});

export async function saveView(
  input: z.input<typeof SaveViewInput>,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize("case.view");
    const v = SaveViewInput.parse(input);
    // Sharing a view with the organisation is a manager's call.
    if (v.shared) await authorize("case.assign");
    const id = uuidv7();
    await withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
      await tx.insert(savedViews).values({
        id,
        orgId: ctx.orgId,
        userId: ctx.userId,
        screen: "notices",
        name: v.name,
        filters: v.filters,
        shared: v.shared,
      });
      await audit.write(tx, scope, {
        actor: ctx.userId,
        action: "view.save",
        targetType: "saved_view",
        targetId: id,
        requestId: ctx.requestId,
        detail: { shared: v.shared },
      });
    });
    return { id };
  });
}

export async function deleteView(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize("case.view");
    const viewId = Id.parse(id);
    await withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
      const [v] = await tx
        .select()
        .from(savedViews)
        .where(and(eq(savedViews.orgId, ctx.orgId), eq(savedViews.id, viewId)))
        .limit(1);
      if (!v) throw notFound("That view");
      if (v.userId !== ctx.userId)
        throw forbidden("Only the person who saved a view can delete it.");
      await tx.delete(savedViews).where(eq(savedViews.id, viewId));
      await audit.write(tx, scope, {
        actor: ctx.userId,
        action: "view.delete",
        targetType: "saved_view",
        targetId: viewId,
        requestId: ctx.requestId,
      });
    });
    return { id: viewId };
  });
}

const BulkInput = z.object({
  caseIds: z.array(Id).min(1).max(1000),
  ownerUserId: Id.nullable().optional(),
  stage: z.enum(STAGES).optional(),
  reason: z.string().trim().max(500).optional(),
});

/** What each case was before a bulk change, for Undo. */
export interface BulkUndo {
  items: { id: string; ownerUserId: string | null; stage: (typeof STAGES)[number] }[];
}

/** Stages a bulk move may set: approval and filing each need their own step on the case page. */
const BULK_STAGES = new Set(["received", "gathering", "drafting", "order", "appeal", "closed"]);

export async function bulkUpdate(
  input: z.input<typeof BulkInput>,
): Promise<ActionResult<BulkUndo>> {
  return runAction(async () => {
    const v = BulkInput.parse(input);
    if (v.ownerUserId === undefined && !v.stage) throw badRequest("Choose an owner or a stage.");
    if (v.stage && !BULK_STAGES.has(v.stage))
      throw badRequest("Approval and filing are done on each case, not in bulk.");
    const ctx = await authorize(v.ownerUserId !== undefined ? "case.assign" : "case.change_stage");
    if (v.ownerUserId && !(await loadPeople(ctx)).some((p) => p.id === v.ownerUserId))
      throw badRequest("That person isn't in your organisation.");
    return withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
      const rows = await tx
        .select()
        .from(cases)
        .where(and(eq(cases.orgId, ctx.orgId), inArray(cases.id, v.caseIds)));
      if (rows.some((r) => !clientAllowed(ctx, r.clientId)))
        throw forbidden("Some of these cases are for clients you don't have access to.");
      const undo: BulkUndo = {
        items: rows.map((r) => ({ id: r.id, ownerUserId: r.ownerUserId, stage: r.stage })),
      };
      for (const c of rows) {
        if (v.ownerUserId !== undefined && v.ownerUserId !== c.ownerUserId) {
          await tx.update(cases).set({ ownerUserId: v.ownerUserId }).where(eq(cases.id, c.id));
          await audit.write(tx, scope, {
            actor: ctx.userId,
            action: "case.assign",
            targetType: "case",
            targetId: c.id,
            requestId: ctx.requestId,
            detail: { from: c.ownerUserId, to: v.ownerUserId, bulk: true },
          });
        }
        if (v.stage && v.stage !== c.stage) {
          // Bulk moves are deliberate jumps: the reason defaults to saying so.
          await moveStage(tx, ctx, scope, c, { to: v.stage, reason: v.reason || "Moved in bulk" });
        }
      }
      return undo;
    });
  });
}

const UndoInput = z.object({
  items: z
    .array(z.object({ id: Id, ownerUserId: Id.nullable(), stage: z.enum(STAGES) }))
    .min(1)
    .max(1000),
});

/**
 * Put cases back as they were before a bulk change. Undo is held to the
 * same rules as the change itself: a new owner needs `case.assign` and must
 * be in the organisation, a stage goes through `moveStage` (approval needs
 * `reply.request_approval`, filing needs the acknowledgement and its
 * number), and every case must be one of the caller's clients.
 */
export async function undoBulk(
  input: z.input<typeof UndoInput>,
): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const v = UndoInput.parse(input);
    const ctx = await authorize("case.change_stage");
    const people = new Set((await loadPeople(ctx)).map((p) => p.id));
    return withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
      const rows = await tx
        .select()
        .from(cases)
        .where(
          and(
            eq(cases.orgId, ctx.orgId),
            inArray(
              cases.id,
              v.items.map((i) => i.id),
            ),
          ),
        );
      const byId = new Map(rows.map((r) => [r.id, r]));
      // Check every case before changing any, so a refused item leaves nothing half-undone.
      for (const item of v.items) {
        const c = byId.get(item.id);
        if (!c) continue;
        requireClient(ctx, "case.view", c.clientId, "That case");
        if (c.ownerUserId !== item.ownerUserId) {
          requireClient(ctx, "case.assign", c.clientId, "That case");
          if (item.ownerUserId && !people.has(item.ownerUserId))
            throw badRequest("That person isn't in your organisation.");
        }
        if (c.stage !== item.stage)
          requireClient(ctx, "case.change_stage", c.clientId, "That case");
      }
      let count = 0;
      for (const item of v.items) {
        const c = byId.get(item.id);
        if (!c) continue;
        if (c.ownerUserId !== item.ownerUserId) {
          await tx
            .update(cases)
            .set({ ownerUserId: item.ownerUserId })
            .where(and(eq(cases.orgId, ctx.orgId), eq(cases.id, c.id)));
          await audit.write(tx, scope, {
            actor: ctx.userId,
            action: "case.assign",
            targetType: "case",
            targetId: c.id,
            requestId: ctx.requestId,
            detail: { from: c.ownerUserId, to: item.ownerUserId, undo: true },
          });
        }
        if (c.stage !== item.stage) {
          // Back to "filed" keeps the case's own acknowledgement number; moveStage checks the upload.
          await moveStage(tx, ctx, scope, c, {
            to: item.stage,
            reason: "Undone",
            ...(c.filingRef ? { filingRef: c.filingRef } : {}),
            ...(c.filedOn ? { filedOn: c.filedOn } : {}),
          });
        }
        count += 1;
      }
      return { count };
    });
  });
}

/** CSV of the current view: the same filters as the screen, applied on the server. Needs `data.export`. */
export async function exportNoticesCsv(
  filters: Record<string, string[]>,
): Promise<ActionResult<{ filename: string; csv: string; count: number }>> {
  return runAction(async () => {
    await authorize("data.export");
    const ctx = await authorize("report.view");
    await enforce(ctx.container, "export.user", ctx.userId);
    const f = FiltersSchema.parse(filters);
    const rows = applyFilters(await loadNoticeRows(ctx), f, ctx.userId);
    await withOrg(ctx.container.database, ctx.orgId, (tx, scope) =>
      audit.write(tx, scope, {
        actor: ctx.userId,
        action: "notices.export_csv",
        targetType: "report",
        requestId: ctx.requestId,
        detail: { rows: rows.length, filters: Object.keys(f) },
      }),
    );
    return {
      filename: `notices-${new Date().toISOString().slice(0, 10)}.csv`,
      csv: toCsv(rows),
      count: rows.length,
    };
  });
}
