"use server";
/**
 * Server actions for clients: create and edit, registrations (which rebuild
 * the statutory calendar), contacts, CSV import, merging duplicates, and
 * recording a demand on one of the client's cases. Each starts with
 * `authorize()`, runs in one org-scoped transaction and writes an audit row.
 */
import { listOrgPeople } from "@dueproof/auth";
import {
  checkCin,
  checkGstin,
  checkPan,
  checkTan,
  fyCode,
  isValidIsoDate,
  normaliseIdentifier,
  panOfGstin,
} from "@dueproof/core";
import {
  and,
  audit,
  cases,
  clients,
  contacts,
  deadlines,
  demands,
  documents,
  eq,
  registrations,
  sql,
  uuidv7,
  withOrg,
} from "@dueproof/db";
import { type ActionResult, runAction } from "@/lib/action";
import { type AuthContext, authorize } from "@/lib/authorize";
import { badRequest, notFound } from "@/lib/errors";
import { regenerateStatutoryDeadlines } from "@/lib/statutory";
import { type Mapping, parseDelimited, validateImport } from "./csv-import";

const text = (v: unknown, max = 200): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

async function assertClient(ctx: AuthContext, clientId: string) {
  if (typeof clientId !== "string" || !clientId) throw badRequest("Choose a client.");
  const [row] = await withOrg(ctx.container.database, ctx.orgId, (tx) =>
    tx
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.orgId, ctx.orgId), eq(clients.id, clientId)))
      .limit(1),
  );
  if (!row) throw notFound("That client");
}

export interface ClientInput {
  name: string;
  legalName?: string;
  pan?: string;
  cin?: string;
  tan?: string;
  gstins?: string[];
  tags?: string[];
  partnerUserId?: string | null;
  notes?: string;
}

async function cleanClient(ctx: AuthContext, input: ClientInput) {
  const name = text(input?.name);
  if (!name) throw badRequest("Give the client a name.");
  const check = (v: string | undefined, fn: typeof checkPan, label: string) => {
    if (!v?.trim()) return null;
    const r = fn(v);
    if (!r.ok)
      throw badRequest(`${label}: ${r.reason ?? "check the number."}`, "invalid_identifier");
    return r.value;
  };
  const pan = check(input.pan, checkPan, "PAN");
  const gstins = [
    ...new Set(
      (input.gstins ?? [])
        .filter((g) => g?.trim())
        .map((g) => {
          const r = checkGstin(g);
          if (!r.ok)
            throw badRequest(
              `GSTIN ${r.value}: ${r.reason ?? "check the number."}`,
              "invalid_identifier",
            );
          return r.value;
        }),
    ),
  ];
  if (input.partnerUserId) {
    const people = await listOrgPeople(ctx.container.database, ctx.orgId);
    if (!people.some((p) => p.userId === input.partnerUserId))
      throw badRequest("That partner isn't in this organisation.");
  }
  return {
    name,
    legalName: text(input.legalName) || null,
    pan: pan ?? (gstins[0] ? panOfGstin(gstins[0]) : null),
    cin: check(input.cin, checkCin, "CIN"),
    tan: check(input.tan, checkTan, "TAN"),
    gstins,
    tags: [...new Set((input.tags ?? []).map((t) => text(t, 40)).filter(Boolean))].slice(0, 20),
    partnerUserId: input.partnerUserId ?? null,
    notes: text(input.notes, 4000) || null,
  };
}

export async function createClient(input: ClientInput): Promise<ActionResult<{ id: string }>> {
  return runAction("createClient", async () => {
    const ctx = await authorize("client.edit");
    const values = await cleanClient(ctx, input);
    const id = uuidv7();
    await withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
      await tx.insert(clients).values({ id, orgId: ctx.orgId, ...values });
      await audit.write(tx, scope, {
        actor: ctx.userId,
        action: "client.created",
        targetType: "client",
        targetId: id,
        requestId: ctx.requestId,
      });
    });
    return { id };
  });
}

export async function updateClient(id: string, input: ClientInput): Promise<ActionResult<null>> {
  return runAction("updateClient", async () => {
    const ctx = await authorize("client.edit", { resource: { clientId: id } });
    await assertClient(ctx, id);
    const values = await cleanClient(ctx, input);
    await withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
      await tx
        .update(clients)
        .set(values)
        .where(and(eq(clients.orgId, ctx.orgId), eq(clients.id, id)));
      await audit.write(tx, scope, {
        actor: ctx.userId,
        action: "client.updated",
        targetType: "client",
        targetId: id,
        requestId: ctx.requestId,
      });
    });
    return null;
  });
}

export interface RegistrationInput {
  id?: string;
  kind: "gst" | "tds" | "income_tax" | "roc" | "other";
  identifier: string;
  state?: string | null;
  frequency?: "monthly" | "quarterly" | "annual" | null;
  scheme?: string | null;
  /** Calendar facts: audit, transferPricing, advanceTax, files24Q, files26Q, companyType. */
  attributes?: Record<string, string | boolean>;
  /** ROC: the AGM date; filed under the financial year it closes. */
  agmOn?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
}

const ATTRIBUTE_KEYS = new Set([
  "audit",
  "transferPricing",
  "advanceTax",
  "files24Q",
  "files26Q",
  "companyType",
  "assesseeType",
]);

function cleanRegistration(input: RegistrationInput) {
  const kinds = ["gst", "tds", "income_tax", "roc", "other"] as const;
  if (!kinds.includes(input?.kind)) throw badRequest("Choose the kind of registration.");
  let identifier = normaliseIdentifier(text(input.identifier, 40));
  if (!identifier) throw badRequest("Enter the registration number.");
  const checker = {
    gst: checkGstin,
    tds: checkTan,
    income_tax: checkPan,
    roc: checkCin,
    other: null,
  }[input.kind];
  if (checker) {
    const r = checker(identifier);
    if (!r.ok) throw badRequest(r.reason ?? "Check the number.", "invalid_identifier");
    identifier = r.value;
  }
  const frequency = input.frequency ?? null;
  if (frequency && !["monthly", "quarterly", "annual"].includes(frequency))
    throw badRequest("Choose monthly, quarterly or annual.");
  if (input.kind === "gst" && !frequency) throw badRequest("Choose how often this GSTIN files.");
  const attributes: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input.attributes ?? {})) {
    if (
      ATTRIBUTE_KEYS.has(k) &&
      (typeof v === "boolean" || (typeof v === "string" && v.length <= 40))
    )
      attributes[k] = v;
  }
  if (input.agmOn) {
    if (!isValidIsoDate(input.agmOn)) throw badRequest("Enter the AGM date.");
    // An AGM held in Sep 2026 is for the year ended 31 Mar 2026: FY2025-26.
    const y = Number(input.agmOn.slice(0, 4));
    const m = Number(input.agmOn.slice(5, 7));
    const fy = fyCode(m >= 4 ? y - 1 : y - 2, 4);
    attributes.events = { [fy]: { agm: input.agmOn } };
  }
  for (const d of [input.validFrom, input.validTo]) {
    if (d && !isValidIsoDate(d)) throw badRequest("Check the validity dates.");
  }
  return {
    kind: input.kind,
    identifier,
    state: input.kind === "gst" ? identifier.slice(0, 2) : text(input.state ?? "", 40) || null,
    frequency,
    scheme:
      text(input.scheme ?? "", 40) ||
      (input.kind === "gst" ? (frequency === "quarterly" ? "qrmp" : "regular") : null),
    attributes,
    validFrom: input.validFrom || null,
    validTo: input.validTo || null,
  };
}

/** Add or change a registration, then rebuild the client's statutory calendar. */
export async function saveRegistration(
  clientId: string,
  input: RegistrationInput,
): Promise<ActionResult<{ id: string; inserted: number; removed: number }>> {
  return runAction("saveRegistration", async () => {
    const ctx = await authorize("client.edit", { resource: { clientId } });
    await assertClient(ctx, clientId);
    const values = cleanRegistration(input);
    const id = input.id || uuidv7();
    await withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
      if (input.id) {
        const updated = await tx
          .update(registrations)
          .set(values)
          .where(
            and(
              eq(registrations.orgId, ctx.orgId),
              eq(registrations.clientId, clientId),
              eq(registrations.id, input.id),
            ),
          )
          .returning({ id: registrations.id });
        if (!updated.length) throw notFound("That registration");
      } else {
        await tx.insert(registrations).values({ id, orgId: ctx.orgId, clientId, ...values });
      }
      // Keep the client's identifiers in step with its registrations.
      if (values.kind === "gst") {
        await tx
          .update(clients)
          .set({
            gstins: sql`(select array(select distinct unnest(array_append(${clients.gstins}, ${values.identifier}))))`,
          })
          .where(and(eq(clients.orgId, ctx.orgId), eq(clients.id, clientId)));
      }
      await audit.write(tx, scope, {
        actor: ctx.userId,
        action: input.id ? "registration.updated" : "registration.created",
        targetType: "client",
        targetId: clientId,
        requestId: ctx.requestId,
        detail: { registrationId: id, kind: values.kind, frequency: values.frequency },
      });
    });
    const result = await regenerateStatutoryDeadlines(ctx.container.database, ctx.orgId, clientId, {
      actor: ctx.userId,
      requestId: ctx.requestId,
    });
    return { id, inserted: result.inserted, removed: result.removed };
  });
}

export async function deleteRegistration(
  clientId: string,
  id: string,
): Promise<ActionResult<null>> {
  return runAction("deleteRegistration", async () => {
    const ctx = await authorize("client.edit", { resource: { clientId } });
    await withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
      const gone = await tx
        .delete(registrations)
        .where(
          and(
            eq(registrations.orgId, ctx.orgId),
            eq(registrations.clientId, clientId),
            eq(registrations.id, id),
          ),
        )
        .returning({ id: registrations.id });
      if (!gone.length) throw notFound("That registration");
      await audit.write(tx, scope, {
        actor: ctx.userId,
        action: "registration.deleted",
        targetType: "client",
        targetId: clientId,
        requestId: ctx.requestId,
        detail: { registrationId: id },
      });
    });
    await regenerateStatutoryDeadlines(ctx.container.database, ctx.orgId, clientId, {
      actor: ctx.userId,
      requestId: ctx.requestId,
    });
    return null;
  });
}

export interface ContactInput {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  role?: string;
}

function cleanPhone(v: string | undefined, label: string): string | null {
  const raw = text(v, 40);
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (!/^\+?\d{10,13}$/.test(digits)) throw badRequest(`${label}: use 10 to 13 digits.`);
  if (/^\d{10}$/.test(digits)) return `+91${digits}`;
  if (/^91\d{10}$/.test(digits)) return `+${digits}`;
  return digits;
}

export async function saveContact(
  clientId: string,
  input: ContactInput,
): Promise<ActionResult<{ id: string }>> {
  return runAction("saveContact", async () => {
    const ctx = await authorize("client.edit", { resource: { clientId } });
    await assertClient(ctx, clientId);
    const name = text(input?.name);
    if (!name) throw badRequest("Give the contact a name.");
    const email = text(input.email, 200) || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw badRequest("Check the email address.");
    const values = {
      name,
      email,
      phone: cleanPhone(input.phone, "Phone"),
      whatsapp: cleanPhone(input.whatsapp, "WhatsApp"),
      role: text(input.role, 80) || null,
    };
    const id = input.id || uuidv7();
    await withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
      if (input.id) {
        const updated = await tx
          .update(contacts)
          .set(values)
          .where(
            and(
              eq(contacts.orgId, ctx.orgId),
              eq(contacts.clientId, clientId),
              eq(contacts.id, input.id),
            ),
          )
          .returning({ id: contacts.id });
        if (!updated.length) throw notFound("That contact");
      } else {
        await tx.insert(contacts).values({ id, orgId: ctx.orgId, clientId, ...values });
      }
      await audit.write(tx, scope, {
        actor: ctx.userId,
        action: input.id ? "contact.updated" : "contact.created",
        targetType: "client",
        targetId: clientId,
        requestId: ctx.requestId,
        detail: { contactId: id },
      });
    });
    return { id };
  });
}

export async function deleteContact(clientId: string, id: string): Promise<ActionResult<null>> {
  return runAction("deleteContact", async () => {
    const ctx = await authorize("client.edit", { resource: { clientId } });
    await withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
      const gone = await tx
        .delete(contacts)
        .where(
          and(eq(contacts.orgId, ctx.orgId), eq(contacts.clientId, clientId), eq(contacts.id, id)),
        )
        .returning({ id: contacts.id });
      if (!gone.length) throw notFound("That contact");
      await audit.write(tx, scope, {
        actor: ctx.userId,
        action: "contact.deleted",
        targetType: "client",
        targetId: clientId,
        requestId: ctx.requestId,
        detail: { contactId: id },
      });
    });
    return null;
  });
}

export interface ImportResult {
  created: number;
  /** Rows matched to an existing client by PAN or GSTIN and left as they were. */
  existing: number;
  skipped: number;
  issues: { line: number; field: string; message: string }[];
  statutory: number;
}

/** Import clients from CSV text with a column mapping. Rows with problems are reported, not written. */
export async function importClients(
  csv: string,
  mapping: Mapping,
): Promise<ActionResult<ImportResult>> {
  return runAction("importClients", async () => {
    const ctx = await authorize("client.edit");
    if (typeof csv !== "string" || !csv.trim()) throw badRequest("The file is empty.");
    if (csv.length > 5 * 1024 * 1024)
      throw badRequest("The file is over 5 MB. Split it and import in parts.");
    if (!mapping || typeof mapping.name !== "number" || mapping.name < 0)
      throw badRequest("Choose which column holds the client name.");
    const [, ...data] = parseDelimited(csv);
    const { rows, issues, skipped } = validateImport(data, mapping);
    const withGst: string[] = [];
    let created = 0;
    let existing = 0;
    await withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
      const current = await tx
        .select({ id: clients.id, pan: clients.pan, gstins: clients.gstins })
        .from(clients)
        .where(eq(clients.orgId, ctx.orgId));
      const known = new Set<string>();
      for (const c of current) {
        if (c.pan) known.add(c.pan);
        for (const g of c.gstins) known.add(g);
      }
      for (const r of rows) {
        if ((r.pan && known.has(r.pan)) || r.gstins.some((g) => known.has(g))) {
          existing += 1;
          continue;
        }
        const id = uuidv7();
        await tx.insert(clients).values({
          id,
          orgId: ctx.orgId,
          name: r.name,
          legalName: r.legalName,
          pan: r.pan,
          tan: r.tan,
          cin: r.cin,
          gstins: r.gstins,
          tags: r.tags,
        });
        if (r.pan) known.add(r.pan);
        for (const g of r.gstins) known.add(g);
        if (r.gstFrequency) {
          for (const g of r.gstins) {
            await tx.insert(registrations).values({
              id: uuidv7(),
              orgId: ctx.orgId,
              clientId: id,
              kind: "gst",
              identifier: g,
              state: g.slice(0, 2),
              frequency: r.gstFrequency,
              scheme: r.gstFrequency === "quarterly" ? "qrmp" : "regular",
            });
          }
          if (r.gstins.length) withGst.push(id);
        }
        if (r.tan) {
          await tx.insert(registrations).values({
            id: uuidv7(),
            orgId: ctx.orgId,
            clientId: id,
            kind: "tds",
            identifier: r.tan,
            frequency: "quarterly",
          });
          if (!withGst.includes(id)) withGst.push(id);
        }
        if (r.contact) {
          await tx.insert(contacts).values({
            id: uuidv7(),
            orgId: ctx.orgId,
            clientId: id,
            name: r.contact.name,
            email: r.contact.email,
            phone: r.contact.phone,
            whatsapp: r.contact.phone,
          });
        }
        created += 1;
      }
      await audit.write(tx, scope, {
        actor: ctx.userId,
        action: "client.imported",
        targetType: "client",
        requestId: ctx.requestId,
        detail: { created, existing, skipped },
      });
    });
    let statutory = 0;
    for (const id of withGst) {
      const r = await regenerateStatutoryDeadlines(ctx.container.database, ctx.orgId, id, {
        actor: ctx.userId,
        requestId: ctx.requestId,
      });
      statutory += r.inserted;
    }
    return { created, existing, skipped, issues: issues.slice(0, 200), statutory };
  });
}

/**
 * Merge a duplicate into the client to keep: its identifiers, tags,
 * registrations, contacts, cases, documents, deadlines and demands move
 * across, and the duplicate is archived (never deleted).
 */
export async function mergeClients(keepId: string, mergeId: string): Promise<ActionResult<null>> {
  return runAction("mergeClients", async () => {
    const ctx = await authorize("client.edit", { resource: { clientId: keepId } });
    if (!keepId || !mergeId || keepId === mergeId)
      throw badRequest("Choose two different clients.");
    await withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
      const both = await tx
        .select()
        .from(clients)
        .where(and(eq(clients.orgId, ctx.orgId), sql`${clients.id} in (${keepId}, ${mergeId})`));
      const keep = both.find((c) => c.id === keepId);
      const drop = both.find((c) => c.id === mergeId);
      if (!keep || !drop) throw notFound("That client");
      await tx
        .update(clients)
        .set({
          gstins: [...new Set([...keep.gstins, ...drop.gstins])],
          tags: [...new Set([...keep.tags, ...drop.tags])],
          pan: keep.pan ?? drop.pan,
          cin: keep.cin ?? drop.cin,
          tan: keep.tan ?? drop.tan,
          legalName: keep.legalName ?? drop.legalName,
          partnerUserId: keep.partnerUserId ?? drop.partnerUserId,
        })
        .where(and(eq(clients.orgId, ctx.orgId), eq(clients.id, keepId)));
      // Statutory rows are rebuilt for the kept client below; drop the duplicate's open ones.
      await tx
        .delete(deadlines)
        .where(
          and(
            eq(deadlines.orgId, ctx.orgId),
            eq(deadlines.clientId, mergeId),
            eq(deadlines.source, "statutory"),
            eq(deadlines.status, "open"),
          ),
        );
      await tx
        .update(deadlines)
        .set({
          clientId: keepId,
          statutoryKey: sql`case when ${deadlines.statutoryKey} is null then null else ${deadlines.statutoryKey} || ':merged:' || ${deadlines.id} end`,
        })
        .where(and(eq(deadlines.orgId, ctx.orgId), eq(deadlines.clientId, mergeId)));
      for (const t of [registrations, contacts] as const) {
        await tx
          .update(t)
          .set({ clientId: keepId })
          .where(and(eq(t.orgId, ctx.orgId), eq(t.clientId, mergeId)));
      }
      await tx
        .update(cases)
        .set({ clientId: keepId })
        .where(and(eq(cases.orgId, ctx.orgId), eq(cases.clientId, mergeId)));
      await tx
        .update(documents)
        .set({ clientId: keepId })
        .where(and(eq(documents.orgId, ctx.orgId), eq(documents.clientId, mergeId)));
      await tx
        .update(demands)
        .set({ clientId: keepId })
        .where(and(eq(demands.orgId, ctx.orgId), eq(demands.clientId, mergeId)));
      await tx
        .update(clients)
        .set({ archivedAt: new Date(), notes: `Merged into ${keep.name}.` })
        .where(and(eq(clients.orgId, ctx.orgId), eq(clients.id, mergeId)));
      await audit.write(tx, scope, {
        actor: ctx.userId,
        action: "client.merged",
        targetType: "client",
        targetId: keepId,
        requestId: ctx.requestId,
        detail: { merged: mergeId },
      });
    });
    await regenerateStatutoryDeadlines(ctx.container.database, ctx.orgId, keepId, {
      actor: ctx.userId,
      requestId: ctx.requestId,
    });
    return null;
  });
}

export interface DemandInput {
  caseId: string;
  taxType: string;
  head: "tax" | "interest" | "penalty" | "fee";
  /** Integer paise. */
  principalMinor: number;
  /** "in.gst.s50.1", "in.it.s234a", … */
  interestRule?: string | null;
  /** When the tax fell due: interest runs from the next day. */
  dueOn?: string | null;
  /** "in.gst.s73", "in.gst.s74", … for the penalty range. */
  penaltyRule?: string | null;
}

const INTEREST_RULES = new Set(["in.gst.s50.1", "in.gst.s50.3", "in.it.s234a"]);
const PENALTY_RULES = new Set([
  "in.gst.s73",
  "in.gst.s74",
  "in.gst.s74a.non_fraud",
  "in.gst.s125",
  "in.it.s270a",
  "in.it.s271_1c",
]);

/** Record a demand as stated in a notice or order, on one of this client's cases. */
export async function recordDemand(
  clientId: string,
  input: DemandInput,
): Promise<ActionResult<{ id: string }>> {
  return runAction("recordDemand", async () => {
    const ctx = await authorize("case.edit", { resource: { clientId } });
    if (!Number.isSafeInteger(input?.principalMinor) || input.principalMinor <= 0)
      throw badRequest("Enter the amount demanded.");
    if (!["tax", "interest", "penalty", "fee"].includes(input.head))
      throw badRequest("Choose the head.");
    const taxType = text(input.taxType, 40);
    if (!taxType) throw badRequest("Choose the tax type.");
    if (input.interestRule && !INTEREST_RULES.has(input.interestRule))
      throw badRequest("Choose an interest rule from the list.");
    if (input.penaltyRule && !PENALTY_RULES.has(input.penaltyRule))
      throw badRequest("Choose a penalty rule from the list.");
    if (input.interestRule && (!input.dueOn || !isValidIsoDate(input.dueOn)))
      throw badRequest("Interest needs the date the tax fell due.");
    const id = uuidv7();
    await withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
      const [c] = await tx
        .select({ id: cases.id, clientId: cases.clientId })
        .from(cases)
        .where(and(eq(cases.orgId, ctx.orgId), eq(cases.id, input.caseId)))
        .limit(1);
      if (!c || c.clientId !== clientId) throw notFound("That case");
      await tx.insert(demands).values({
        id,
        orgId: ctx.orgId,
        caseId: c.id,
        clientId,
        taxType,
        head: input.head,
        principalMinor: input.principalMinor,
        interestRule: input.interestRule || null,
        inputs: {
          ...(input.dueOn ? { dueOn: input.dueOn } : {}),
          ...(input.penaltyRule ? { penaltyRule: input.penaltyRule } : {}),
          enteredBy: ctx.userId,
        },
      });
      await audit.write(tx, scope, {
        actor: ctx.userId,
        action: "demand.recorded",
        targetType: "case",
        targetId: c.id,
        requestId: ctx.requestId,
        detail: { demandId: id, head: input.head },
      });
    });
    return { id };
  });
}
