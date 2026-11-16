import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons";
import { PageHero } from "@/components/PageHero";
import { REPO } from "@/lib/site";

export const metadata: Metadata = { title: "Security and privacy" };

const COLLECT = [
  [
    "Self-hosted server, desktop app, phones on your server",
    "Nothing. No telemetry, no analytics, no crash reports to us, no licence phone-home. The update check is off by default; turned on, it fetches a public signed manifest and sends nothing.",
  ],
  [
    "Hosted",
    "No product analytics, no session recording, no third-party trackers. We keep what running the service needs: security and error logs without document text, billing metering and AI usage counts, all listed in the privacy policy.",
  ],
  ["This website", "No cookies and no analytics. Static pages, nothing more."],
] as const;

const RESIDENCY = [
  ["Database and app functions", "Mumbai (Neon Postgres, Vercel)", "Your own server"],
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
    "Vercel Sandbox, which may not run in Mumbai",
    "Your own server",
  ],
  [
    "Email and WhatsApp messages",
    "Through Resend, and Meta where WhatsApp is on",
    "Your SMTP server; your Meta account, off by default",
  ],
  ["Error reports (no document text)", "Sentry", "Not sent"],
] as const;

const CONTROLS = [
  [
    "Sign-in",
    "Argon2id password hashes, passkeys, TOTP and recovery codes; MFA required for admins on hosted. Sign in with Google or Microsoft in both editions, SAML with Business or Enterprise.",
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
    "Accepted by their contents, not their names, with caps on size, pages and pixels. Processed in a sandbox.",
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
    "Signed desktop builds and updates; auto-update only when you turn it on. The licence key is checked offline.",
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
            single sign-on, WhatsApp, Web Push, the update check). A Network page in Settings lists
            every destination that is switched on.
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
              Hosted runs in Mumbai where it can. Where it doesn't, we say so here and in Settings.
              If you need every byte in India today, self-host.
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
                Processor obligations at launch: a data processing agreement, a list of
                sub-processors, a breach process, and export and deletion on request.
              </span>
            </li>
            <li>
              <span>Security testing</span>
              <span className="muted">
                A VAPT by a CERT-In-empanelled auditor before hosted general availability. SOC 2
                Type I and ISO 27001 come after v0.1.
              </span>
            </li>
            <li>
              <span>CERT-In log rules</span>
              <span className="muted">
                An open question. Our hosting keeps logs briefly and not in India; the likely answer
                is security and access logs kept for 180 days in the Mumbai database, but we're
                taking legal advice before claiming it. <span className="verify">verify</span>
              </span>
            </li>
            <li>
              <span>Who can see your documents</span>
              <span className="muted">
                Support works from what you send and from IDs and error codes. If a document must be
                looked at, you grant time-boxed access in the app, and that access is logged where
                you can see it.
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
              we acknowledge within 2 working days.
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
