import Link from "next/link";
import { type Doc, docTitle, SECTIONS, SLUGS } from "@/lib/docs";
import { RELEASED, REPO } from "@/lib/site";

const href = (slug: string) => (slug === "index" ? "/docs/" : `/docs/${slug}/`);
const label = (slug: string) => (slug === "index" ? "Overview" : docTitle(slug));

export function DocsShell({ doc }: { doc: Doc }) {
  const at = SLUGS.indexOf(doc.slug);
  const prev = SLUGS[at - 1];
  const next = SLUGS[at + 1];
  return (
    <div className="wrap docs">
      <nav className="docs-nav" aria-label="Documentation">
        <details open>
          <summary>Documentation</summary>
          {SECTIONS.map((s) => (
            <div key={s.title}>
              <p>{s.title}</p>
              <ul>
                {s.pages.map((slug) => (
                  <li key={slug}>
                    <Link href={href(slug)} aria-current={slug === doc.slug ? "page" : undefined}>
                      {label(slug)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </details>
      </nav>
      <div>
        <p className="callout docs-note">
          <strong>These pages document the {RELEASED}.</strong> The documentation for v0.1 arrives
          with the release; until then, the plan is in the repository.
        </p>
        <article className="prose">
          <h1>{doc.title}</h1>
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: build-time Markdown from the repo's own docs/ */}
          <div dangerouslySetInnerHTML={{ __html: doc.html }} />
        </article>
        <nav className="docs-pager" aria-label="Next and previous">
          {prev ? (
            <Link href={href(prev)}>
              Previous<strong>{label(prev)}</strong>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link className="next" href={href(next)}>
              Next<strong>{label(next)}</strong>
            </Link>
          )}
        </nav>
        <p className="fine" style={{ marginTop: "var(--dp-space-24)" }}>
          <a href={`${REPO}/edit/main/docs/${doc.slug}.md`}>Improve this page on GitHub</a>
        </p>
      </div>
      {doc.headings.length > 1 && (
        <aside className="docs-toc" aria-label="On this page">
          <p>On this page</p>
          <ul>
            {doc.headings.map((h) => (
              <li key={h.id}>
                <a href={`#${h.id}`}>{h.text}</a>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
