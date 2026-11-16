/** Search results, shared by the loader and the view. */
export interface SearchHit {
  id: string;
  kind: "page" | "finding" | "case";
  title: string;
  client: string | null;
  /** Snippet with the matched words between START and STOP markers. */
  snippet: string;
  page: number | null;
  caseId: string | null;
  documentId: string | null;
  findingId: string | null;
}

export const START = "⟦";
export const STOP = "⟧";
