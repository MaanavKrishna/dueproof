// The documentation pages are the Markdown files in ../docs, rendered at
// build time, so the site and the repository never disagree.
import { readFileSync } from "node:fs";
import path from "node:path";
import { Marked, type Token, type Tokens } from "marked";
import { REPO, asset } from "./site";

const DOCS = path.join(process.cwd(), "..", "docs");

/** Reading order, grouped the way people look for things. */
export const SECTIONS: { title: string; pages: string[] }[] = [
  { title: "Start", pages: ["index", "install", "quickstart"] },
  { title: "Using it", pages: ["notices", "workflow-and-reminders", "languages", "profiles"] },
  { title: "Running it", pages: ["accounts-and-sso", "deployment", "configuration", "security"] },
  { title: "Reference", pages: ["evaluation", "api", "architecture", "faq"] },
];
export const SLUGS = SECTIONS.flatMap((s) => s.pages);

export const slugify = (text: string) =>
  text.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");

/** Where a link inside the docs should point on the website. */
function rewrite(href: string): string {
  if (/^(https?:|mailto:|#)/.test(href)) return href;
  const [file, hash] = href.split("#");
  const anchor = hash ? `#${hash}` : "";
  if (file.startsWith("images/")) return asset(`/docs-images/${file.slice(7)}`);
  const doc = file.match(/^(?:\.\/)?([\w-]+)\.md$/);
  if (doc && SLUGS.includes(doc[1])) return `${asset(doc[1] === "index" ? "/docs/" : `/docs/${doc[1]}/`)}${anchor}`;
  // Anything else lives in the repository: ../README.md, ../dueproof/...
  const inRepo = path.posix.normalize(path.posix.join("docs", file));
  return `${REPO}/blob/main/${inRepo}${anchor}`;
}

const marked = new Marked({
  gfm: true,
  walkTokens(token: Token) {
    if (token.type === "link" || token.type === "image") token.href = rewrite(token.href);
  },
  renderer: {
    heading(this: { parser: { parseInline: (t: Token[]) => string } }, { tokens, depth }: Tokens.Heading) {
      const html = this.parser.parseInline(tokens);
      return `<h${depth} id="${slugify(html)}">${html}</h${depth}>\n`;
    },
  },
});

export type Doc = { slug: string; title: string; html: string; headings: { id: string; text: string }[] };

export function readDoc(slug: string): Doc {
  const source = readFileSync(path.join(DOCS, `${slug}.md`), "utf8");
  const title = source.match(/^#\s+(.+)$/m)?.[1].trim() ?? slug;
  const body = source.replace(/^#\s+.+\n/m, "");           // the page draws its own title
  const headings = [...body.matchAll(/^##\s+(.+)$/gm)].map((m) => {
    const text = m[1].replace(/[`*_]/g, "").trim();
    return { id: slugify(marked.parseInline(m[1]) as string), text };
  });
  return { slug, title, html: marked.parse(body) as string, headings };
}

export const docTitle = (slug: string) => readDoc(slug).title;
