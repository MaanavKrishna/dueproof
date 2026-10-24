import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle } from "@/components/PageTitle";
import { REPO } from "@/lib/site";

export const metadata: Metadata = { title: "Security" };

const BUILT_IN = [
  ["Nothing leaves the machine", "Translation runs locally with network access switched off. There is no telemetry, no licence server, no cloud call."],
  ["Sign-in", "Built-in accounts with scrypt-hashed passwords and hashed session tokens, a brake on repeated attempts, or your own single sign-on through a proxy."],
  ["An audit trail", "Sign-ins, uploads, views, proof-panel opens, searches, edits and exports are appended to a log that is never rewritten."],
  ["A hardened web layer", "A strict Content-Security-Policy with no inline script and no third-party origins, CSRF protection, no framing, no referrer."],
  ["Careful with uploads", "Files are accepted by their contents, not their names, with caps on size, pages and pixels. Page images are served without path tricks."],
  ["Safe exports", "Document text is escaped wherever it is shown, and spreadsheet formula injection is defused in CSV."],
];

const YOURS = [
  "Put HTTPS in front with a reverse proxy; an example Caddy configuration is included.",
  "Keep the port off the open internet.",
  "Schedule backups with dueproof backup, and test a restore.",
  "Keep the operating system, Python and Tesseract patched.",
];

const NOT_YET = [
  "Per-document access control: everyone signed in sees every document.",
  "Malware scanning of uploads.",
  "Encryption at rest beyond what your disk provides.",
  "Two-factor sign-in of its own. Use your identity provider in proxy mode for that.",
];

export default function Security() {
  return (
    <>
      <PageTitle title="Your notices stay on your server">
        <p>
          Notices carry tax positions, PAN and GSTIN numbers, and amounts in dispute. Dueproof is built so that
          none of it has to leave the building.
        </p>
      </PageTitle>

      <section className="band band-paper">
        <div className="wrap">
          <div className="section-head"><h2>What is built in</h2></div>
          <div className="facts">
            {BUILT_IN.map(([h, p]) => <div className="fact" key={h}><h3>{h}</h3><p>{p}</p></div>)}
          </div>
        </div>
      </section>

      <section className="band">
        <div className="wrap split">
          <div>
            <h2 style={{ marginBottom: 20 }}>What is up to you</h2>
            <ul className="measure" style={{ paddingLeft: "1.1em", color: "var(--ink-2)" }}>
              {YOURS.map((y) => <li key={y} style={{ marginBottom: 10 }}>{y}</li>)}
            </ul>
          </div>
          <div>
            <h2 style={{ marginBottom: 20 }}>What it does not do yet</h2>
            <ul className="measure" style={{ paddingLeft: "1.1em", color: "var(--ink-2)" }}>
              {NOT_YET.map((y) => <li key={y} style={{ marginBottom: 10 }}>{y}</li>)}
            </ul>
          </div>
        </div>
      </section>

      <section className="band cloth">
        <div className="wrap">
          <div className="section-head">
            <h2>Found a vulnerability?</h2>
            <p>
              Please don't open a public issue. Report it privately through GitHub's vulnerability reporting on
              the repository, and we will reply there.
            </p>
          </div>
          <div className="actions">
            <a className="btn btn-line" href={`${REPO}/security/advisories/new`}>Report privately</a>
            <Link className="btn btn-line" href="/docs/security/">Security in the documentation</Link>
          </div>
        </div>
      </section>
    </>
  );
}
