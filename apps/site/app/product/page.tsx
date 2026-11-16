import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons";
import { PageHero } from "@/components/PageHero";
import { ReceiptClock } from "@/components/ReceiptClock";

export const metadata: Metadata = { title: "Product" };

const PIPELINE = [
  [
    "In",
    "Upload or drag a folder, forward to an email-in address, or photograph a letter on a phone. WhatsApp intake is planned, once Meta approves it.",
  ],
  [
    "Read",
    "Text and the position of every word come off the page, through an OCR ladder for scans. Indian-language text is translated offline.",
  ],
  [
    "Find",
    "Rules and, if you turned AI on, a model both propose findings: duties, deadline rules, hearings, amounts, references, sections.",
  ],
  [
    "Prove",
    "Each finding's quote is located on the page and outlined. A finding that can't be located stays an unverified suggestion.",
  ],
  [
    "Compute",
    "The date engine turns the rule into a date, using the receipt date, working days and holidays. A model never writes a date.",
  ],
  [
    "Track",
    "Findings join a case with stages, owners and approvals, beside the client's statutory calendar and open demands.",
  ],
] as const;

const SCREENS = [
  [
    "Today",
    "What is overdue, due today and this week, what needs review, hearings, replies awaiting approval and, for partners, the firm's ₹ exposure.",
  ],
  [
    "Inbox",
    "Uploads in progress and the review queue: findings below the bar, AI suggestions to confirm, unmatched clients, likely duplicates. J and K to move, Enter to confirm.",
  ],
  [
    "Notices",
    "One row per case, with client, type, stage, demand, owner and language. Saved views, bulk actions and a column chooser.",
  ],
  [
    "Case page",
    "The stage bar, the thread of documents, demand and interest with workings, finding cards and the proof viewer beside them.",
  ],
  [
    "Deadlines",
    "Notice deadlines, appeal windows, hearings and statutory filings together, as a list, a calendar or a timeline.",
  ],
  [
    "Clients",
    "Registrations (GSTIN, PAN, CIN, TAN), the client's statutory calendar and exposure.",
  ],
  [
    "Ask",
    "Questions across the register, answered with citations. An answer without a citation is refused. Only when AI is on.",
  ],
  [
    "Reports",
    "An evidence report that crops each passage from its page, client statements, workload and CSV.",
  ],
] as const;

const LADDER = ["PDFium", "PaddleOCR", "Tesseract", "Vision model"];

export default function Product() {
  return (
    <>
      <PageHero overline="Product" title="From the post to a proved deadline.">
        <p>
          A notice goes in as a PDF, a scan or a photograph. What comes out is a case with dated
          duties, each one outlined on the page it came from and each date shown with the rule that
          produced it.
        </p>
      </PageHero>

      <section className="band band-canvas" aria-labelledby="pipeline-title">
        <div className="wrap">
          <div className="section-head">
            <p className="overline">How it works</p>
            <h2 id="pipeline-title" className="h2">
              Six steps, each one checkable.
            </h2>
          </div>
          <ol className="pipeline">
            {PIPELINE.map(([h, p]) => (
              <li key={h}>
                <h3>{h}</h3>
                <p>{p}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="band" aria-labelledby="dates-title">
        <div className="wrap split split-even">
          <div className="stack">
            <p className="overline">Dates are computed</p>
            <h2 id="dates-title" className="h2">
              "Within 30 days of receipt" depends on when it reached you.
            </h2>
            <p className="lede">
              The rule comes off the page; the date comes from code. Dueproof records the day each
              notice reached you and counts from it, so a notice that arrived late isn't given a
              deadline that has already passed.
            </p>
            <p className="fine">
              A simplified illustration. The date engine also applies the rule's working-day and
              holiday settings from your organisation.
            </p>
          </div>
          <ReceiptClock />
        </div>
      </section>

      <section className="band band-canvas" aria-labelledby="ocr-title">
        <div className="wrap grid-2">
          <div className="stack">
            <p className="overline">Reading hard pages</p>
            <h2 id="ocr-title" className="h2">
              A ladder, not a single guess.
            </h2>
            <p className="muted">
              Each page climbs only as far as it needs. Every rung must give the position of each
              word, because the outline is drawn from those positions. Which tools sit on the ladder
              is settled by a bake-off on real notices. <span className="verify">verify</span>
            </p>
          </div>
          <div className="stack">
            <ol className="ladder" aria-label="OCR ladder">
              {LADDER.flatMap((rung, i) => [
                <li key={rung}>{rung}</li>,
                ...(i < LADDER.length - 1
                  ? [
                      <li key={`${rung}-to`} className="arrow" aria-hidden="true">
                        →
                      </li>,
                    ]
                  : []),
              ])}
            </ol>
            <p className="muted small">
              Text-layer PDFs are read directly. Scans and photos go to OCR. A vision model helps
              only on the hardest pages, and only with AI on; the linker must still find the words,
              or the finding is unverified.
            </p>
          </div>
        </div>
      </section>

      <section className="band" aria-labelledby="screens-title">
        <div className="wrap">
          <div className="section-head section-head-wide">
            <p className="overline">The app</p>
            <h2 id="screens-title" className="h2">
              One calm screen for today. Everything else a click away.
            </h2>
            <p className="muted">
              Built on Ledger, our design system: light first, dense where it helps, keyboard-first,
              with ⌘K or Ctrl K everywhere.
            </p>
          </div>
          <ul className="rule-list">
            {SCREENS.map(([h, p]) => (
              <li key={h}>
                <span>{h}</span>
                <span className="muted">{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="band band-canvas" aria-labelledby="calm-title">
        <div className="wrap grid-3">
          <div className="card-flat">
            <h2 id="calm-title" className="h3">
              A calmer day
            </h2>
            <p className="muted small">
              A morning digest for each person, escalation rules when something slips, and a
              one-click hearing pack. Planned for v0.1 as "should have", after the core.
            </p>
          </div>
          <div className="card-flat">
            <h3 className="h3">Corrections that keep the original</h3>
            <p className="muted small">
              Change a date and the original stays beside the correction, with who changed it and
              when. History is append-only.
            </p>
          </div>
          <div className="card-flat">
            <h3 className="h3">Made for your profile</h3>
            <p className="muted small">
              Profiles hold the notice vocabularies you receive. The default covers Indian tax,
              corporate, labour, regulatory and court notices.
            </p>
          </div>
        </div>
        <div className="wrap" style={{ marginTop: "var(--dp-space-48)" }}>
          <Link className="text-link" href="/use-cases/">
            Who it's for <ArrowRightIcon size={16} />
          </Link>
        </div>
      </section>
    </>
  );
}
