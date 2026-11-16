import Link from "next/link";
import { REPO } from "@/lib/site";
import { SECTIONS, SLUGS, docTitle, type Doc } from "@/lib/docs";

const href = (slug: string) => (slug === "index" ? "/docs/" : `/docs/${slug}/`);

export function DocsShell({ doc }: { doc: Doc }) {
  const at = SLUGS.indexOf(doc.slug);
  const prev = SLUGS[at - 1];
  const next = SLUGS[at + 1];
  return (
    <div className="wrap docs">
      <nav className="docs-nav" aria-label="Documentation">
        {SECTIONS.map((s) => (
          <div key={s.title}>
            <p>{s.title}</p>
            <ul>
              {s.pages.map((slug) => (
                <li key={slug}>
                  <Link href={href(slug)} aria-current={slug === doc.slug ? "page" : undefined}>
                    {slug === "index" ? "Overview" : docTitle(slug)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div>
        <article className="prose">
          <h1>{doc.title}</h1>
          <div dangerouslySetInnerHTML={{ __html: doc.html }} />
        </article>
        <nav className="docs-pager" aria-label="Next and previous">
          {prev ? <Link href={href(prev)}>Previous<strong>{prev === "index" ? "Overview" : docTitle(prev)}</strong></Link> : <span />}
          {next && <Link href={href(next)} style={{ textAlign: "right" }}>Next<strong>{docTitle(next)}</strong></Link>}
        </nav>
        <p className="edit muted"><a href={`${REPO}/edit/main/docs/${doc.slug}.md`}>Improve this page on GitHub</a></p>
      </div>
    </div>
  );
}
