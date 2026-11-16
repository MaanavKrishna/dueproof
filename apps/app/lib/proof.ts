/**
 * The proof viewer's data for a document: each page image behind a
 * short-lived signed URL (05 §2), its size in the unit the boxes use (PDF
 * points for PDFs, pixels for photos and scans), its text as the text
 * alternative, and one highlight per finding. Read inside withOrg; the
 * storage key never leaves the server.
 */
import "server-only";
import { and, asc, documents, eq, evidence, findings, type OrgTx, pages } from "@dueproof/db";

export interface ProofPageData {
  number: number;
  src: string;
  width: number;
  height: number;
  unit: "pt" | "px";
  text?: string;
}

export interface ProofHighlightData {
  id: string;
  page: number;
  rects: [number, number, number, number][];
  label: string;
  quote?: string;
  grade: "exact" | "strong" | "approximate" | "unlocated";
}

export interface ProofData {
  documentId: string;
  title: string;
  languages: string[];
  pages: ProofPageData[];
  highlights: ProofHighlightData[];
}

/** 1×1 transparent GIF: a page whose image hasn't been rendered (yet). */
const BLANK_PAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export type SignUrl = (key: string) => Promise<string>;

export async function readProof(
  tx: OrgTx,
  orgId: string,
  documentId: string,
  sign: SignUrl,
): Promise<ProofData | null> {
  const [doc] = await tx
    .select({
      id: documents.id,
      filename: documents.filename,
      title: documents.title,
      mime: documents.mime,
      languages: documents.languages,
    })
    .from(documents)
    .where(and(eq(documents.orgId, orgId), eq(documents.id, documentId)))
    .limit(1);
  if (!doc) return null;
  const [pageRows, findingRows, proofRows] = await Promise.all([
    tx
      .select({
        page: pages.page,
        width: pages.width,
        height: pages.height,
        imageKey: pages.imageKey,
        text: pages.text,
      })
      .from(pages)
      .where(and(eq(pages.orgId, orgId), eq(pages.documentId, documentId)))
      .orderBy(asc(pages.page)),
    tx
      .select({
        id: findings.id,
        text: findings.text,
        textEn: findings.textEn,
        quote: findings.quote,
        verification: findings.verification,
        status: findings.status,
      })
      .from(findings)
      .where(and(eq(findings.orgId, orgId), eq(findings.documentId, documentId)))
      .orderBy(asc(findings.ord)),
    tx
      .select({ findingId: evidence.findingId, page: evidence.page, rects: evidence.rects })
      .from(evidence)
      .where(and(eq(evidence.orgId, orgId), eq(evidence.documentId, documentId))),
  ]);
  const unit = doc.mime === "application/pdf" ? "pt" : "px";
  const proofByFinding = new Map(proofRows.map((p) => [p.findingId, p]));
  return {
    documentId: doc.id,
    title: doc.title ?? doc.filename,
    languages: doc.languages,
    pages: await Promise.all(
      pageRows.map(async (p) => ({
        number: p.page,
        src: p.imageKey ? await sign(p.imageKey) : BLANK_PAGE,
        width: p.width,
        height: p.height,
        unit,
        ...(p.text ? { text: p.text } : {}),
      })),
    ),
    highlights: findingRows
      .filter((f) => f.status !== "dismissed")
      .map((f) => {
        const proof = proofByFinding.get(f.id);
        return {
          id: f.id,
          page: proof?.page ?? 1,
          rects: proof && f.verification !== "unlocated" ? proof.rects : [],
          label: f.textEn ?? f.text,
          quote: f.quote,
          grade: proof ? f.verification : "unlocated",
        };
      }),
  };
}
