/**
 * GET /api/v1/reports/{name}.csv — CSV export of each report and table view:
 * deadlines (with the Deadlines filters), clients, workload, exposure,
 * statement (?client=) and evidence (?case=|client=|range=). Each starts
 * with authorizeRequest for the report's permission, then the export.user
 * rate limit (L5).
 */
import { listClients } from "@/features/clients/queries";
import { applyFilters } from "@/features/deadlines/group";
import { loadDeadlinesPage } from "@/features/deadlines/queries";
import {
  loadClientStatement,
  loadEvidenceReport,
  loadExposureReport,
  loadWorkload,
} from "@/features/reports/queries";
import { type Action, authorizeRequest } from "@/lib/authorize";
import { csvResponse, rupees, toCsv } from "@/lib/csv";
import { badRequest, errorResponse, notFound } from "@/lib/errors";
import { limitRequest } from "@/lib/rate-limit";

async function authorizeExport(request: Request, action: Action) {
  const ctx = await authorizeRequest(request, action);
  await limitRequest(request, "export", ctx);
  return ctx;
}

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  try {
    const { name } = await params;
    const url = new URL(request.url);
    const q = (k: string) => url.searchParams.get(k) ?? undefined;
    switch (name) {
      case "deadlines.csv": {
        const ctx = await authorizeExport(request, "case.view");
        const data = await loadDeadlinesPage(ctx);
        const filters: Record<string, string[]> = {};
        for (const k of ["client", "person", "type", "status", "source"]) {
          const v = q(k);
          if (v) filters[k] = v.split(",");
        }
        const people = new Map(data.people.map((p) => [p.id, p.name]));
        const rows = applyFilters(data.rows, filters, data.today);
        return csvResponse(
          "deadlines.csv",
          toCsv(
            [
              "Due on",
              "Title",
              "Client",
              "Source",
              "Type",
              "Status",
              "Owner",
              "Basis",
              "Condonation window ends",
              "Case",
            ],
            rows.map((r) => [
              r.dueOn,
              r.title,
              r.clientName,
              r.source,
              r.type,
              r.status,
              r.ownerUserId ? people.get(r.ownerUserId) : "",
              r.basis,
              r.windowEndOn,
              r.caseTitle,
            ]),
          ),
        );
      }
      case "clients.csv": {
        const ctx = await authorizeExport(request, "client.view");
        const { rows } = await listClients(ctx);
        return csvResponse(
          "clients.csv",
          toCsv(
            [
              "Name",
              "Legal name",
              "PAN",
              "GSTINs",
              "TAN",
              "CIN",
              "Open items",
              "Overdue",
              "Exposure (INR, estimate)",
              "Partner",
              "Tags",
            ],
            rows.map((r) => [
              r.name,
              r.legalName,
              r.pan,
              r.gstins.join(" "),
              r.tan,
              r.cin,
              r.openItems,
              r.overdue,
              r.exposureMinor === null ? "" : rupees(r.exposureMinor),
              r.partnerName,
              r.tags.join("; "),
            ]),
          ),
        );
      }
      case "workload.csv": {
        const ctx = await authorizeExport(request, "report.view");
        const w = await loadWorkload(ctx);
        return csvResponse(
          "workload.csv",
          toCsv(
            ["Person", "Overdue", ...w.weeks.map((d) => `Week of ${d}`), "Later", "Total"],
            w.rows.map((r) => [r.name, r.overdue, ...r.perWeek, r.later, r.total]),
          ),
        );
      }
      case "exposure.csv": {
        const ctx = await authorizeExport(request, "exposure.view");
        const { view } = await loadExposureReport(ctx, q("client"));
        return csvResponse(
          "exposure.csv",
          toCsv(
            [
              "Client",
              "Case",
              "Tax",
              "Head",
              "Status",
              "Demand (INR)",
              "Interest to as-of (INR, estimate)",
              "Penalty low (INR, estimate)",
              "Penalty high (INR, estimate)",
              "As of",
            ],
            view.demands.map((d) => [
              d.clientId ? view.clientNames[d.clientId] : "",
              d.caseTitle,
              d.taxType,
              d.head,
              d.status,
              rupees(d.principalMinor),
              rupees(d.interestMinor),
              rupees(d.penaltyLowMinor),
              rupees(d.penaltyHighMinor),
              view.asOf,
            ]),
          ),
        );
      }
      case "statement.csv": {
        const ctx = await authorizeExport(request, "report.view");
        const client = q("client");
        if (!client) throw badRequest("Choose a client.");
        const s = await loadClientStatement(ctx, client);
        return csvResponse(
          `statement-${s.client.name}.csv`,
          toCsv(
            ["Due on", "What", "Source", "Basis", "Condonation window ends"],
            s.deadlines.map((r) => [r.dueOn, r.title, r.source, r.basis, r.windowEndOn]),
          ),
        );
      }
      case "evidence.csv": {
        const ctx = await authorizeExport(request, "report.view");
        const scope = {
          ...(q("case") ? { caseId: q("case") as string } : {}),
          ...(q("client") ? { clientId: q("client") as string } : {}),
          ...(q("range") ? { range: q("range") as string } : {}),
        };
        const r = await loadEvidenceReport(ctx, scope);
        return csvResponse(
          "evidence.csv",
          toCsv(
            [
              "Document",
              "Kind",
              "Finding",
              "Quote",
              "Page",
              "Verification",
              "Origin",
              "Due on",
              "Basis",
            ],
            r.items.map((i) => [
              i.document.reference ?? i.document.filename,
              i.kind,
              i.text,
              i.quote,
              i.proof?.page ?? "",
              i.verification,
              i.origin,
              i.deadlines.map((d) => d.dueOn).join(" "),
              i.deadlines.map((d) => d.basis).join(" | "),
            ]),
          ),
        );
      }
      default:
        throw notFound("That report");
    }
  } catch (e) {
    return errorResponse(e);
  }
}
