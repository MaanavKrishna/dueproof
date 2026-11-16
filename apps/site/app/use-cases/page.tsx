import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons";
import { PageHero } from "@/components/PageHero";

export const metadata: Metadata = { title: "Use cases" };

const TEAMS = [
  {
    who: "CA firms",
    lead: "Juniors download 30 to 60 notices a day from the GST, income-tax, TRACES and MCA portals, plus photos from clients. Managers run teams across hundreds of clients. Partners sign the replies.",
    how: [
      [
        "Juniors",
        "Bulk upload of files and folders, and a keyboard review queue to confirm or correct each finding fast. You pick the client when you file a notice in a case.",
      ],
      ["Managers", "A workload report by person, overdue first, and bulk reassignment."],
      [
        "Partners",
        "One screen for what's about to blow up, ₹ exposure per client, replies awaiting approval, and a hearing pack.",
      ],
    ],
  },
  {
    who: "Company secretaries",
    lead: "ROC, SEBI, stock-exchange and RBI letters for one to twenty group companies. The board asks who's handling each one; auditors ask when you first knew.",
    how: [
      ["An entity view", "Every company's notices, hearings and filings in one place."],
      [
        "When you knew",
        "The date each notice reached you is recorded, and every correction is kept with a name and a time.",
      ],
      [
        "Board-ready evidence",
        "A report that prints each duty with its passage cropped from the page.",
      ],
    ],
  },
  {
    who: "Compliance teams at lenders and NBFCs",
    lead: "Circulars in English, orders and summons in the language of the state that issued them, and inspectors asking how you knew.",
    how: [
      [
        "On your premises",
        "The self-hosted edition keeps everything on your own servers, with AI off unless you turn it on.",
      ],
      [
        "Access and audit",
        "Client-level access, an append-only audit trail, and a signed audit export with a Business key.",
      ],
      [
        "Redaction",
        "PAN, Aadhaar and bank numbers can be redacted before any text reaches a model.",
      ],
    ],
  },
  {
    who: "IT administrators",
    lead: "The person who installs it, secures it and keeps it running.",
    how: [
      [
        "A clean deployment",
        "Docker Compose with Postgres and Caddy. People, health, backups and the audit check in Settings; single sign-on with Business.",
      ],
      [
        "Nothing hidden",
        "A Network page lists every outbound destination switched on. No telemetry to switch off.",
      ],
      [
        "Backups you can check",
        "Nightly backups, a backup before each upgrade, and the last good backup shown in Settings.",
      ],
    ],
  },
] as const;

const NOT_FOR = [
  [
    "Filing or paying for you",
    "Dueproof proposes; a person decides. It never sends a reply, files on a portal or makes a payment. Drafts are drafts.",
  ],
  [
    "An interface in your language, yet",
    "Notices are read in 22 Indian languages, but the app itself is in English in v0.1.",
  ],
  ["Native phone apps", "Phones use the installable web app in v0.1. Store apps come later."],
  [
    "Every byte in India, hosted",
    "Hosted data sits in Singapore and Asia-Pacific today, not in India. Self-host if you need that.",
  ],
] as const;

export default function UseCases() {
  return (
    <>
      <PageHero overline="Use cases" title="For people who answer for a missed date.">
        <p>
          Dueproof is built first for CA firms, and serves company secretaries and compliance teams
          with the same features, an entity view and stricter settings.
        </p>
      </PageHero>

      {TEAMS.map((t, i) => (
        <section
          key={t.who}
          className={`band${i % 2 === 0 ? " band-canvas" : ""}`}
          aria-labelledby={`team-${i}`}
        >
          <div className="wrap split">
            <div className="stack">
              <p className="overline">0{i + 1}</p>
              <h2 id={`team-${i}`} className="h2">
                {t.who}
              </h2>
              <p className="muted">{t.lead}</p>
            </div>
            <ul className="rule-list">
              {t.how.map(([h, p]) => (
                <li key={h}>
                  <span>{h}</span>
                  <span className="muted">{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      <section className="band band-dark" data-theme="dark" aria-labelledby="not-title">
        <div className="wrap">
          <div className="section-head">
            <p className="overline">Better to know now</p>
            <h2 id="not-title" className="h2">
              What it isn't.
            </h2>
          </div>
          <div className="fact-grid two">
            {NOT_FOR.map(([h, p]) => (
              <div key={h}>
                <h3 className="h4">{h}</h3>
                <p>{p}</p>
              </div>
            ))}
          </div>
          <p style={{ marginTop: "var(--dp-space-40)" }}>
            <Link className="text-link" href="/pricing/">
              Choose an edition <ArrowRightIcon size={16} />
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
