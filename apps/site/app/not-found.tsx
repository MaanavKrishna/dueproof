import Link from "next/link";

export default function NotFound() {
  return (
    <section className="nf">
      <div className="wrap">
        <p className="overline">Page not found</p>
        <h1 className="display" style={{ margin: "var(--dp-space-24) 0", maxWidth: "14ch" }}>
          This page isn't in the register.
        </h1>
        <p className="lede" style={{ marginBottom: "var(--dp-space-32)" }}>
          The link may be old, or the page may have moved.
        </p>
        <div className="actions">
          <Link className="cta cta-primary" href="/">Home</Link>
          <Link className="cta cta-secondary" href="/docs/">Documentation</Link>
        </div>
      </div>
    </section>
  );
}
