import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons";
import { PageHero } from "@/components/PageHero";
import { REPO } from "@/lib/site";

export const metadata: Metadata = { title: "Security and privacy" };

const COLLECT = [
  [
    "Self-hosted server, desktop app, phones on your server",
    "Nothing. No telemetry, no analytics, no crash reports to us, no licence phone-home. The server makes no update checks. The desktop app checks for updates only if you turn it on.",
  ],
  [
    "Hosted",
    "No product analytics, no session recording, no third-party trackers. We keep what running the service needs: security and error logs without document text, and AI usage counts.",
  ],
  ["This website", "No cookies and no analytics. Static pages, nothing more."],
] as const;

const RESIDENCY = [
  [
    "Database and app functions",
    "Singapore (Neon Postgres, Vercel): the closest region our database provider offers to India",
    "Your own server",
  ],
  ["Reading engine (OCR, rules, proof)", "Mumbai (Vercel). It keeps nothing", "Your own server"],
  [
    "Uploaded files and page images",
    "Cloudflare R2, which does not guarantee India-only storage",
    "Your own server",
  ],
  [
    "Text sent to a model, when AI is on",
    "Where that provider runs the model; India-region inference preferred where offered",
    "Your provider or your local model",
  ],
  [
    "Heavy work: offline translation, rare-script OCR",
    "Off in the v0.1 beta. When on: Vercel Sandbox, which may not run in India",
    "Your own server",
  ],
  [
    "Email (invitations, resets, the digest)",
    "Through Resend, once email is set up on hosted",
    "Your SMTP server or Resend account, if you set one up",
  ],
  ["Logs (no document text, keys or tokens)", "Vercel", "Your own server"],
] as const;

const CONTROLS = [
  [
    "Sign-in",
    "Argon2id password hashes, passkeys, and two-step verification with an authenticator app and backup codes. SAML single sign-on with Business.",
  ],
  [
    "Access",
    "Five roles plus client-level grants, enforced in one policy layer that denies by default. Approving a reply is its own permission, and never for the person who asked.",
  ],
  [
    "Isolation",
    "On hosted, every query runs in an organisation-scoped transaction with row-level security, and an isolation test suite runs in CI.",
  ],
  [
    "Audit",
    "Every write records who, when and what changed. Edits, case events and the audit trail are append-only, and the audit log is hash-chained.",
  ],
  [
    "Files",
    "Accepted by their contents, not their names, with caps on size, pages and pixels. Opened only by the engine, which has no database access and no storage keys.",
  ],
  [
    "Web",
    "A strict Content Security Policy, HSTS, no framing, same-origin referrers, and CSRF checks on every action.",
  ],
  [
    "Your AI keys",
    "Encrypted with a per-organisation key, write-only, masked, decrypted only for the call, never logged, and every use audited.",
  ],
  [
    "The model",
    "No tools, no write path, schema-only output, and every quote checked against the page. It can propose; it can't act.",
  ],
  [
    "Releases",
    "Desktop builds are not code-signed yet; signed builds come before the beta ends. The app checks for updates only if you turn that on, and every update is signed. The licence key is checked offline.",
  ],
] as const;

export default function Security() {
  return (
    <>
      <PageHero overline="Security and privacy" title="Your documents go only where you send them.">
        <p>
          Firms hand Dueproof tax demands, court summons and regulator letters. This page says what
          v0.1 is built to do, and where your data lives, including the parts that aren't in India.
        </p>
      </PageHero>

      <section className="band band-canvas" aria-labelledby="collect-title">
        <div className="wrap">
          <div className="section-head">
            <p className="overline">Data collection</p>
            <h2 id="collect-title" className="h2">
              What we collect: almost nothing, and on self-hosted, nothing.
            </h2>
          </div>
          <ul className="rule-list">
            {COLLECT.map(([h, p]) => (
              <li key={h}>
                <span>{h}</span>
                <span className="muted">{p}</span>
              </li>
            ))}
          </ul>
          <p className="muted small" style={{ marginTop: "var(--dp-space-24)" }}>
            Self-hosted makes no outbound call unless an admin turns it on (an AI provider, email,
            single sign-on, Web Push). The Network section of Settings → System lists every
            destination that is switched on.
          </p>
        </div>
      </section>

      <section className="band" aria-labelledby="residency-title">
        <div className="wrap">
          <div className="section-head section-head-wide">
            <p className="overline">Residency</p>
            <h2 id="residency-title" className="h2">
              Where your data lives, stated honestly.
            </h2>
            <p className="muted">
              Hosted runs as close to India as our providers allow: the reading engine in Mumbai,
              the database and app in Singapore. Every place your data goes is listed here. If you
              need every byte in India today, self-host.
            </p>
          </div>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">What</th>
                  <th scope="col">Hosted by us</th>
                  <th scope="col">Self-hosted</th>
                </tr>
              </thead>
              <tbody>
                {RESIDENCY.map(([what, hosted, self]) => (
                  <tr key={what}>
                    <th scope="row">{what}</th>
                    <td>{hosted}</td>
                    <td>{self}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="fine" style={{ marginTop: "var(--dp-space-16)" }}>
            Where Vercel Sandbox runs is being confirmed. <span className="verify">verify</span> Web
            assets are served from a global CDN and contain no customer data.
          </p>
        </div>
      </section>

      <section className="band band-dark" data-theme="dark" aria-labelledby="controls-title">
        <div className="wrap">
          <div className="section-head">
            <p className="overline">Built in</p>
            <h2 id="controls-title" className="h2">
              Security is a feature, designed in from the start.
            </h2>
          </div>
          <div className="fact-grid">
            {CONTROLS.map(([h, p]) => (
              <div key={h}>
                <h3 className="h4">{h}</h3>
                <p>{p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="band" aria-labelledby="road-title">
        <div className="wrap grid-2">
          <div className="stack">
            <p className="overline">Compliance</p>
            <h2 id="road-title" className="h2">
              What's done, and what's still open.
            </h2>
            <p className="muted">We'd rather tell you about a gap than have you find it.</p>
          </div>
          <ul className="rule-list">
            <li>
              <span>DPDP Act 2023</span>
              <span className="muted">
                Planned before hosted plans go on sale: a data processing agreement, a list of
                sub-processors, a breach process, and export and deletion on request. They are not
                published yet.
              </span>
            </li>
            <li>
              <span>Security testing</span>
              <span className="muted">
                No independent test yet. A VAPT by a CERT-In-empanelled auditor comes before v0.1
                leaves beta. SOC 2 Type I and ISO 27001 come after v0.1.
              </span>
            </li>
            <li>
              <span>CERT-In log rules</span>
              <span className="muted">
                An open question. Our hosting keeps logs briefly and not in India; the likely answer
                is security and access logs kept for 180 days in our own database, but we're taking
                legal advice before claiming it. <span className="verify">verify</span>
              </span>
            </li>
            <li>
              <span>Who can see your documents</span>
              <span className="muted">
                Support works from what you send and from IDs and error codes. A way to grant
                support time-boxed, logged access to a document is planned; it is not in the beta.
              </span>
            </li>
          </ul>
        </div>
      </section>

      <section className="band band-canvas" aria-labelledby="report-title">
        <div className="wrap">
          <div className="section-head">
            <p className="overline">Found a vulnerability?</p>
            <h2 id="report-title" className="h2">
              Please tell us privately.
            </h2>
            <p className="lede">
              Don't open a public issue. Report it through GitHub's private vulnerability reporting;
              you should hear back within a few days.
            </p>
          </div>
          <div className="actions">
            <a className="cta cta-primary" href={`${REPO}/security/advisories/new`}>
              Report privately
            </a>
            <Link className="cta cta-secondary" href="/docs/security/">
              Security in the documentation <ArrowRightIcon size={16} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
