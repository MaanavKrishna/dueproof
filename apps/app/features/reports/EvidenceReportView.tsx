"use client";
/**
 * The evidence report: each finding beside the cropped page region that
 * proves it (highlighted), with its basis and the audit trail. The crop is
 * done in CSS from the stored rects, so nothing is re-rendered server-side.
 */
import { Badge, EmptyState, longDate, shortDate } from "@dueproof/ui";
import type { EvidenceItem, EvidenceReport } from "./queries";
import { ReportFrame } from "./ReportFrame";
import styles from "./reports.module.css";

const VERIFICATION: Record<
  string,
  { label: string; tone: "success" | "info" | "warning" | "danger" }
> = {
  exact: { label: "Exact match on the page", tone: "success" },
  strong: { label: "Strong match", tone: "success" },
  approximate: { label: "Approximate match: check", tone: "warning" },
  unlocated: { label: "Not located on the page", tone: "danger" },
};
const ORIGIN: Record<string, string> = {
  rule: "Rules",
  ai: "AI, checked against the page",
  "rule+ai": "Rules and AI",
  human: "Entered by a person",
};

/** The page band around the highlights, as percentages, for the CSS crop. */
export function cropBox(proof: NonNullable<EvidenceItem["proof"]>) {
  const ys = proof.rects.flatMap((r) => [r[1], r[3]]);
  const pad = proof.height * 0.04;
  const top = Math.max(0, Math.min(...ys) - pad);
  const bottom = Math.min(proof.height, Math.max(...ys) + pad);
  const band = Math.max(bottom - top, proof.height * 0.06);
  return {
    aspect: `${proof.width} / ${band}`,
    imageTop: `${(-top / band) * 100}%`,
    imageHeight: `${(proof.height / band) * 100}%`,
    marks: proof.rects.map((r) => ({
      left: `${(r[0] / proof.width) * 100}%`,
      top: `${((r[1] - top) / band) * 100}%`,
      width: `${((r[2] - r[0]) / proof.width) * 100}%`,
      height: `${((r[3] - r[1]) / band) * 100}%`,
    })),
  };
}

function ProofCrop({ item }: { item: EvidenceItem }) {
  const p = item.proof;
  if (!p?.rects.length) {
    return (
      <div className={styles.small}>
        Not located on the page. A person must confirm this finding before it counts.
      </div>
    );
  }
  const box = cropBox(p);
  return (
    <figure className={styles.crop} style={{ aspectRatio: box.aspect, margin: 0 }}>
      {p.imageUrl ? (
        // biome-ignore lint/performance/noImgElement: a signed page image, cropped with CSS.
        <img
          className={styles.cropImage}
          src={p.imageUrl}
          alt=""
          style={{ top: box.imageTop, height: box.imageHeight }}
        />
      ) : (
        <span className={styles.noImage}>Page image not available</span>
      )}
      {box.marks.map((m, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rects have no identity beyond their order.
        <span key={i} className={styles.mark} style={m} aria-hidden="true" />
      ))}
      <figcaption
        className={styles.small}
        style={{
          position: "absolute",
          insetInlineEnd: "var(--dp-space-4)",
          insetBlockEnd: "var(--dp-space-2)",
        }}
      >
        Page {p.page}
      </figcaption>
    </figure>
  );
}

export function EvidenceReportView({
  report,
  csvHref,
}: {
  report: EvidenceReport;
  csvHref: string;
}) {
  return (
    <ReportFrame
      org={report.org}
      title="Evidence report"
      scope={report.scope}
      generatedOn={report.generatedOn}
      csvHref={csvHref}
    >
      <EvidenceBody report={report} />
    </ReportFrame>
  );
}

/** The findings, their page crops and the audit trail (also used inside the hearing pack). */
export function EvidenceBody({ report }: { report: EvidenceReport }) {
  const docs = [...new Map(report.items.map((i) => [i.document.id, i])).values()];
  return (
    <>
      {!report.items.length ? (
        <EmptyState
          size="compact"
          title="No findings in this scope"
          description="Choose another case, client or date range."
        />
      ) : null}
      {docs.map((d) => (
        <section key={d.document.id}>
          <h2 className={styles.h2}>
            {d.document.reference ?? d.document.filename}
            {d.clientName ? ` · ${d.clientName}` : ""}
          </h2>
          <div className={styles.small}>
            {[
              d.document.docType,
              d.document.issuedOn ? `issued ${longDate(d.document.issuedOn)}` : null,
              d.document.receivedOn ? `received ${longDate(d.document.receivedOn)}` : null,
              d.document.filename,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
          {report.items
            .filter((i) => i.document.id === d.document.id)
            .map((i) => (
              <div key={i.findingId} className={styles.item}>
                <div className={styles.itemText}>
                  <span className={styles.kind}>{i.kind}</span>
                  <strong>{i.text}</strong>
                  <blockquote className={styles.quote}>“{i.quote}”</blockquote>
                  <span>
                    <Badge size="sm" tone={VERIFICATION[i.verification]?.tone ?? "neutral"}>
                      {VERIFICATION[i.verification]?.label ?? i.verification}
                    </Badge>{" "}
                    <span className={styles.small}>
                      {ORIGIN[i.origin] ?? i.origin}
                      {i.confirmedBy ? ` · confirmed by ${i.confirmedBy}` : ""}
                    </span>
                  </span>
                  {i.deadlines.map((dl) => (
                    <span key={`${dl.dueOn}-${dl.basis}`} className={styles.small}>
                      Due {longDate(dl.dueOn)}: {dl.basis}
                      {dl.windowEndOn
                        ? `. Condonation window to ${longDate(dl.windowEndOn)} (a separate date).`
                        : ""}
                    </span>
                  ))}
                </div>
                <ProofCrop item={i} />
              </div>
            ))}
        </section>
      ))}
      {report.audit.length ? (
        <section>
          <h2 className={styles.h2}>Audit trail</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Who</th>
                <th scope="col">What</th>
              </tr>
            </thead>
            <tbody>
              {report.audit.map((a, n) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: audit rows in order.
                <tr key={n}>
                  <td>
                    {shortDate(a.at.slice(0, 10))} {a.at.slice(11, 16)} UTC
                  </td>
                  <td>{a.actor}</td>
                  <td>{a.action.replace(/[._]/g, " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.small}>
            The audit trail is append-only and hash-chained, so a removed or changed entry shows.
          </p>
        </section>
      ) : null}
    </>
  );
}
