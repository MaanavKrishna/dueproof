"use client";
/** Client statement, workload, exposure and hearing pack: printable A4 reports. */
import { Amount, DueChip, longDate, shortDate } from "@dueproof/ui";
import type { DeadlineRow } from "@/lib/deadline-rows";
import { EvidenceBody } from "./EvidenceReportView";
import type { ClientStatement, ExposureReport, HearingPack, WorkloadReport } from "./queries";
import { ReportFrame } from "./ReportFrame";
import styles from "./reports.module.css";

const SOURCE: Record<string, string> = {
  notice: "Notice",
  order: "Order",
  statutory: "Statutory filing",
  manual: "Added by hand",
};
const STAGE: Record<string, string> = {
  received: "Received",
  gathering: "Gathering documents",
  drafting: "Drafting the reply",
  approval: "Awaiting approval",
  filed: "Reply filed",
  order: "Order received",
  appeal: "In appeal",
  closed: "Closed",
};

function DeadlineTable({
  rows,
  showClient = false,
}: {
  rows: DeadlineRow[];
  showClient?: boolean;
}) {
  if (!rows.length) return <p className={styles.small}>Nothing due.</p>;
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">Due</th>
          <th scope="col">What</th>
          {showClient ? <th scope="col">Client</th> : null}
          <th scope="col">Why this date</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <DueChip state={r.state} detail={shortDate(r.dueOn)} size="sm" />
            </td>
            <td>
              {r.title}
              <div className={styles.small}>{SOURCE[r.source]}</div>
            </td>
            {showClient ? <td>{r.clientName ?? "—"}</td> : null}
            <td className={styles.small}>
              {r.basis}
              {r.windowEndOn
                ? `. Condonation window to ${longDate(r.windowEndOn)} (a separate date).`
                : ""}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StatementView({ report }: { report: ClientStatement }) {
  const c = report.client;
  return (
    <ReportFrame
      org={report.org}
      title={`Statement for ${c.name}`}
      scope={[c.legalName, c.pan ? `PAN ${c.pan}` : null, ...c.gstins.map((g) => `GSTIN ${g}`)]
        .filter(Boolean)
        .join(" · ")}
      generatedOn={report.generatedOn}
      csvHref={`/api/v1/reports/statement.csv?client=${c.id}`}
    >
      <h2 className={styles.h2}>Open notices</h2>
      {report.cases.length ? (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Notice</th>
              <th scope="col">Reference</th>
              <th scope="col">Where it stands</th>
              <th scope="col">Received</th>
            </tr>
          </thead>
          <tbody>
            {report.cases.map((k) => (
              <tr key={k.id}>
                <td>
                  {k.title}
                  {k.authority ? <div className={styles.small}>{k.authority}</div> : null}
                </td>
                <td>{k.reference ?? "—"}</td>
                <td>{STAGE[k.stage] ?? k.stage}</td>
                <td>{shortDate(k.openedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className={styles.small}>No open notices.</p>
      )}
      <h2 className={styles.h2}>Due in the next three months</h2>
      <DeadlineTable rows={report.deadlines} />
    </ReportFrame>
  );
}

export function WorkloadView({ report }: { report: WorkloadReport }) {
  return (
    <ReportFrame
      org={report.org}
      title="Workload"
      scope="Open items by person and by week"
      generatedOn={report.generatedOn}
      csvHref="/api/v1/reports/workload.csv"
    >
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Person</th>
            <th scope="col" className={styles.num}>
              Overdue
            </th>
            {report.weeks.map((w) => (
              <th key={w} scope="col" className={styles.num}>
                {shortDate(w)}
              </th>
            ))}
            <th scope="col" className={styles.num}>
              Later
            </th>
            <th scope="col" className={styles.num}>
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r) => (
            <tr key={r.userId ?? "none"}>
              <th scope="row">{r.name}</th>
              <td className={styles.num}>{r.overdue ? <strong>{r.overdue}</strong> : 0}</td>
              {r.perWeek.map((n, i) => (
                <td key={report.weeks[i]} className={styles.num}>
                  {n}
                </td>
              ))}
              <td className={styles.num}>{r.later}</td>
              <td className={styles.num}>{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.small}>
        Weeks start on Monday. Statutory filings, notice deadlines and items added by hand are
        counted together.
      </p>
    </ReportFrame>
  );
}

const TAX: Record<string, string> = {
  gst: "GST",
  income_tax: "Income tax",
  tds: "TDS",
  roc: "ROC",
};

export function ExposureReportView({ report }: { report: ExposureReport }) {
  const v = report.view;
  const firm = v.exposure.firm;
  return (
    <ReportFrame
      org={report.org}
      title="Exposure"
      scope={`Open demand, interest to ${longDate(v.asOf)} and penalty ranges`}
      generatedOn={report.generatedOn}
      csvHref="/api/v1/reports/exposure.csv"
    >
      <h2 className={styles.h2}>By client</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Client</th>
            <th scope="col" className={styles.num}>
              Demand (open)
            </th>
            <th scope="col" className={styles.num}>
              Interest (estimate)
            </th>
            <th scope="col" className={styles.num}>
              Penalty range (estimate)
            </th>
          </tr>
        </thead>
        <tbody>
          {v.exposure.ranking.map((r) => {
            const t = v.exposure.clients[r.clientId];
            if (!t) return null;
            return (
              <tr key={r.clientId}>
                <th scope="row">{v.clientNames[r.clientId] ?? "No client"}</th>
                <td className={styles.num}>
                  <Amount minor={t.openMinor} />
                </td>
                <td className={styles.num}>
                  <Amount minor={t.computedInterestMinor} estimate />
                </td>
                <td className={styles.num}>
                  <Amount minor={t.penaltyLowMinor} to={t.penaltyHighMinor} estimate />
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Firm</th>
            <td className={styles.num}>
              <Amount minor={firm.openMinor} />
            </td>
            <td className={styles.num}>
              <Amount minor={firm.computedInterestMinor} estimate />
            </td>
            <td className={styles.num}>
              <Amount minor={firm.penaltyLowMinor} to={firm.penaltyHighMinor} estimate />
            </td>
          </tr>
        </tfoot>
      </table>
      <h2 className={styles.h2}>By tax type</h2>
      <table className={styles.table}>
        <tbody>
          {Object.entries(firm.byTaxType).map(([t, s]) => (
            <tr key={t}>
              <th scope="row">{TAX[t] ?? t}</th>
              <td className={styles.num}>
                <Amount minor={s.openMinor} />
              </td>
              <td className={styles.num}>
                <Amount minor={s.computedInterestMinor} estimate />
              </td>
              <td className={styles.num}>
                <Amount minor={s.penaltyLowMinor} to={s.penaltyHighMinor} estimate />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {v.workings.length ? <h2 className={styles.h2}>Workings</h2> : null}
      {v.workings.map((w) => (
        <section key={w.demandId} className={styles.item} style={{ gridTemplateColumns: "1fr" }}>
          <strong>{w.title}</strong>
          <table className={styles.table}>
            <tbody>
              {w.steps.map((s) => (
                <tr key={`${s.label}-${s.formula}`}>
                  <th scope="row">{s.label}</th>
                  <td className={styles.small}>
                    {s.formula}
                    {Object.keys(s.inputs).length
                      ? ` (${Object.entries(s.inputs)
                          .map(([k, x]) => `${k}: ${x}`)
                          .join("; ")})`
                      : ""}
                  </td>
                  <td className={styles.num}>{s.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <span className={styles.small}>
            {w.citation}
            {w.verified ? "" : " · rate and method not yet checked by a CA (verify)"}
          </span>
        </section>
      ))}
    </ReportFrame>
  );
}

const ROLE: Record<string, string> = {
  notice: "Notice",
  reply: "Reply",
  acknowledgement: "Acknowledgement",
  order: "Order",
  appeal: "Appeal",
  attachment: "Attachment",
  other: "Other",
};

export function HearingPackView({ pack }: { pack: HearingPack }) {
  const replies = pack.documents.filter((d) => d.role === "reply" || d.role === "acknowledgement");
  return (
    <ReportFrame
      org={pack.org}
      title={`Hearing pack: ${pack.case.title}`}
      scope={[pack.case.clientName, pack.case.reference, pack.case.authority]
        .filter(Boolean)
        .join(" · ")}
      generatedOn={pack.generatedOn}
    >
      <h2 className={styles.h2}>Contents</h2>
      <ol className={styles.contents}>
        <li>The notice and where the case stands</li>
        <li>Replies filed ({replies.length})</li>
        <li>Documents ({pack.documents.length})</li>
        <li>Deadlines</li>
        <li>Evidence: each finding on its page</li>
      </ol>
      <h2 className={styles.h2}>1. The notice</h2>
      <table className={styles.table}>
        <tbody>
          <tr>
            <th scope="row">Type</th>
            <td>{pack.case.noticeType ?? "—"}</td>
          </tr>
          <tr>
            <th scope="row">Reference</th>
            <td>{pack.case.reference ?? "—"}</td>
          </tr>
          <tr>
            <th scope="row">Authority</th>
            <td>{pack.case.authority ?? "—"}</td>
          </tr>
          <tr>
            <th scope="row">Where it stands</th>
            <td>{STAGE[pack.case.stage] ?? pack.case.stage}</td>
          </tr>
          {pack.case.filingRef ? (
            <tr>
              <th scope="row">Filed</th>
              <td>
                {pack.case.filingRef}
                {pack.case.filedOn ? ` on ${longDate(pack.case.filedOn)}` : ""}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <h2 className={styles.h2}>2. Replies filed</h2>
      {replies.length ? (
        <ul className={styles.contents}>
          {replies.map((d) => (
            <li key={d.id}>
              {d.reference ?? d.filename}
              {d.receivedOn ? `, ${longDate(d.receivedOn)}` : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.small}>No reply on file yet.</p>
      )}
      <h2 className={styles.h2}>3. Documents</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Document</th>
            <th scope="col">Kind</th>
            <th scope="col">Received</th>
            <th scope="col" className={styles.num}>
              Pages
            </th>
          </tr>
        </thead>
        <tbody>
          {pack.documents.map((d) => (
            <tr key={d.id}>
              <td>{d.reference ?? d.filename}</td>
              <td>{ROLE[d.role] ?? d.role}</td>
              <td>{d.receivedOn ? shortDate(d.receivedOn) : "—"}</td>
              <td className={styles.num}>{d.pageCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 className={styles.h2}>4. Deadlines</h2>
      <DeadlineTable rows={pack.deadlines} />
      <div className={styles.pageBreak} />
      <h2 className={styles.h2}>5. Evidence</h2>
      <EvidenceBody report={pack.evidence} />
    </ReportFrame>
  );
}
