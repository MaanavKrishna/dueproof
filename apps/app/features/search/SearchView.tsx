"use client";
import { CaseIcon, DocumentIcon, ProofIcon, SearchIcon } from "@dueproof/icons";
import { Badge, Card, EmptyState, Link, ListPageTemplate, SearchField } from "@dueproof/ui";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, Fragment, useState } from "react";
import styles from "@/components/screen.module.css";
import { type SearchHit, START, STOP } from "./model";

/** The snippet with matched words in bold. Text only: no HTML from the database is rendered. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(START);
  return (
    <p className={styles.snippet} dir="auto">
      {parts.map((part, i) => {
        const [hit, rest] = i === 0 ? [null, part] : (part.split(STOP) as [string, string?]);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: fragments of one immutable string
          <Fragment key={i}>
            {hit ? <strong>{hit}</strong> : null}
            {rest ?? ""}
          </Fragment>
        );
      })}
    </p>
  );
}

function hrefOf(h: SearchHit): string {
  if (!h.caseId) return "/inbox";
  const qs = new URLSearchParams();
  if (h.documentId) qs.set("doc", h.documentId);
  if (h.page) qs.set("page", String(h.page));
  if (h.findingId) qs.set("finding", h.findingId);
  const s = qs.toString();
  return `/cases/${h.caseId}${s ? `?${s}` : ""}`;
}

const KIND = {
  case: { icon: CaseIcon, label: "Case" },
  finding: { icon: ProofIcon, label: "Finding" },
  page: { icon: DocumentIcon, label: "Page" },
} as const;

export function SearchView({
  query,
  hits,
  error,
}: {
  query: string;
  hits: SearchHit[];
  error: string | null;
}) {
  const router = useRouter();
  const [q, setQ] = useState(query);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };
  return (
    <ListPageTemplate
      title="Search"
      subtitle={
        query
          ? `${hits.length} result${hits.length === 1 ? "" : "s"} for “${query}”`
          : "Every page and finding in the register"
      }
      scrollPage
      filterBar={
        <search>
          <form onSubmit={submit} className={styles.row}>
            <SearchField
              label="Search pages, findings and cases"
              value={q}
              onValueChange={setQ}
              placeholder="A reference, a GSTIN, a section, words on the page"
              autoFocus
            />
          </form>
        </search>
      }
    >
      <div className={styles.content}>
        {error ? (
          <EmptyState
            icon={SearchIcon}
            size="compact"
            title="Try a longer search"
            description={error}
          />
        ) : !query ? (
          <EmptyState
            icon={SearchIcon}
            size="standard"
            headingLevel={2}
            title="Search the register"
            description="Words in quotes match exactly; a minus sign leaves a word out. Results open the case at the page."
          />
        ) : !hits.length ? (
          <EmptyState
            icon={SearchIcon}
            size="standard"
            headingLevel={2}
            title="Nothing found"
            description="Check the spelling, or search for a reference or GSTIN."
          />
        ) : (
          <Card padding="md">
            <ol className={styles.list} aria-label="Results">
              {hits.map((h) => {
                const k = KIND[h.kind];
                return (
                  <li key={h.id} className={styles.result}>
                    <span className={styles.row}>
                      <Badge
                        tone={h.kind === "finding" ? "accent" : "neutral"}
                        icon={k.icon}
                        size="sm"
                      >
                        {k.label}
                      </Badge>
                      <Link asChild>
                        <NextLink href={hrefOf(h)} className={styles.ellipsis}>
                          {h.title}
                        </NextLink>
                      </Link>
                    </span>
                    <span className={styles.small}>
                      {h.client ?? "No client yet"}
                      {h.page ? ` · page ${h.page}` : ""}
                      {!h.caseId && h.kind !== "case" ? " · not in a case yet" : ""}
                    </span>
                    {h.snippet ? <Snippet text={h.snippet} /> : null}
                  </li>
                );
              })}
            </ol>
          </Card>
        )}
      </div>
    </ListPageTemplate>
  );
}
