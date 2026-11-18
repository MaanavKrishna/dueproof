/**
 * Search (01 §4): Postgres full text over page text and findings, using the
 * GIN expression indexes from migration 0003 ('simple' configuration, so
 * every language's words match as written), plus cases by reference or
 * client name. Results carry a snippet and the page; the snippet is shown
 * to the person who searched and never logged.
 */
import "server-only";
import { rowsOf, sql, withOrg } from "@dueproof/db";
import type { AuthContext } from "@/lib/authorize";
import { badRequest } from "@/lib/errors";
import { enforce } from "@/lib/rate-limit";
import { type SearchHit, START, STOP } from "./model";

export type { SearchHit } from "./model";

const HEADLINE = `StartSel=${START}, StopSel=${STOP}, MaxWords=24, MinWords=10, ShortWord=2, MaxFragments=2, FragmentDelimiter=" … "`;

export async function search(ctx: AuthContext, raw: string, limit = 40): Promise<SearchHit[]> {
  const q = raw.trim().slice(0, 200);
  if (!q) return [];
  if (q.length < 2) throw badRequest("Type at least two characters.");
  // Three full-text queries per search: the search.user rate limit (L5).
  await enforce(ctx.container, "search.user", ctx.userId);
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return withOrg(ctx.container.database, ctx.orgId, async (tx) => {
    const tsq = sql`websearch_to_tsquery('simple', ${q})`;
    // Client-level access: documents with no client yet, or one on the person's list.
    const ids = ctx.clientIds ? [...ctx.clientIds] : null;
    const docScope = ids
      ? sql`and (d.client_id is null or d.client_id = any(${sql.param(ids)}::text[]))`
      : sql``;
    const caseScope = ids
      ? sql`and (k.client_id is null or k.client_id = any(${sql.param(ids)}::text[]))`
      : sql``;
    const pageRows = rowsOf<{
      document_id: string;
      page: number;
      filename: string;
      title: string | null;
      case_id: string | null;
      client: string | null;
      snippet: string;
      rank: number;
    }>(
      await tx.execute(sql`
        select p.document_id, p.page, d.filename, d.title, d.case_id, c.name as client,
               ts_headline('simple', p.text, ${tsq}, ${HEADLINE}) as snippet,
               ts_rank(to_tsvector('simple', p.text), ${tsq}) as rank
        from pages p
        join documents d on d.id = p.document_id and d.org_id = p.org_id
        left join clients c on c.id = d.client_id
        where p.org_id = ${ctx.orgId} and to_tsvector('simple', p.text) @@ ${tsq} ${docScope}
        order by rank desc
        limit ${limit}`),
    );
    const findingRows = rowsOf<{
      id: string;
      text: string;
      document_id: string;
      case_id: string | null;
      page: number | null;
      client: string | null;
      snippet: string;
      rank: number;
    }>(
      await tx.execute(sql`
        select f.id, coalesce(f.text_en, f.text) as text, f.document_id, f.case_id, e.page, c.name as client,
               ts_headline('simple', f.quote, ${tsq}, ${HEADLINE}) as snippet,
               ts_rank(to_tsvector('simple', f.text || ' ' || f.quote), ${tsq}) as rank
        from findings f
        join documents d on d.id = f.document_id and d.org_id = f.org_id
        left join clients c on c.id = d.client_id
        left join evidence e on e.finding_id = f.id and e.org_id = f.org_id
        where f.org_id = ${ctx.orgId} and f.status <> 'dismissed' ${docScope}
          and to_tsvector('simple', f.text || ' ' || f.quote) @@ ${tsq}
        order by rank desc
        limit ${limit}`),
    );
    const caseRows = rowsOf<{
      id: string;
      title: string;
      reference: string | null;
      client: string | null;
    }>(
      await tx.execute(sql`
        select k.id, k.title, k.reference, c.name as client
        from cases k left join clients c on c.id = k.client_id
        where k.org_id = ${ctx.orgId} ${caseScope}
          and (k.reference ilike ${like} or c.name ilike ${like} or ${q}::text = any(c.gstins) or k.title ilike ${like})
        order by k.created_at desc
        limit 10`),
    );
    return [
      ...caseRows.map((c) => ({
        id: `case:${c.id}`,
        kind: "case" as const,
        title: c.reference ? `${c.reference} · ${c.title}` : c.title,
        client: c.client,
        snippet: "",
        page: null,
        caseId: c.id,
        documentId: null,
        findingId: null,
      })),
      ...findingRows.map((f) => ({
        id: `finding:${f.id}`,
        kind: "finding" as const,
        title: f.text,
        client: f.client,
        snippet: f.snippet,
        page: f.page,
        caseId: f.case_id,
        documentId: f.document_id,
        findingId: f.id,
      })),
      ...pageRows.map((p) => ({
        id: `page:${p.document_id}:${p.page}`,
        kind: "page" as const,
        title: p.title ?? p.filename,
        client: p.client,
        snippet: p.snippet,
        page: p.page,
        caseId: p.case_id,
        documentId: p.document_id,
        findingId: null,
      })),
    ];
  });
}
