import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle } from "@/components/PageTitle";
import { Shot } from "@/components/Shot";

export const metadata: Metadata = { title: "How it works" };

// What Dueproof reads off the sample GST notice; each line is pinned by a test
// in tests/test_notices.py.
const READ_OFF = [
  ["Kind of notice", "GST notice, filed to the GST & Indirect Tax desk"],
  ["Reference", "ZD2910260012345"],
  ["Issued by", "Assistant Commissioner of State Tax"],
  ["Dated", "20 October 2026"],
  ["Amount demanded", "Rs. 4,52,300"],
  ["Provisions cited", "Section 61, Section 73(1)"],
  ["Duty", "Explain the discrepancies and pay the tax with interest, within 30 days of receipt"],
  ["Due", "23 November 2026, for a notice received on 24 October"],
  ["Hearing", "18 November 2026, 11:00 AM"],
];

const WORK = [
  ["An owner for every duty", "Assign a person or leave it with the desk. View the deadline list one desk at a time."],
  ["Corrections that keep the original", "Change a date, a desk or an owner. Dueproof stores who changed what and when, next to what it first read."],
  ["Done and dismissed", "Close an item when it is handled, or dismiss a sentence that was never a duty. Dismissals become labels for measuring accuracy."],
  ["A weekly email", "Each person gets the items due in the coming days and anything overdue. It runs from cron or a systemd timer."],
  ["Search across every page", "In English and in the original script, including scanned pages."],
  ["Take it with you", "A printable evidence report with each passage cropped from its page, and a spreadsheet of the register."],
];

export default function Product() {
  return (
    <>
      <PageTitle title="How Dueproof reads a notice">
        <p>
          A notice goes in as a PDF or a photograph. What comes out is a set of entries, each with a date, a desk
          and the exact passage it rests on, outlined on the page.
        </p>
      </PageTitle>

      <section className="band band-paper">
        <div className="wrap split split-wide">
          <div>
            <h2 style={{ marginBottom: 16 }}>What it reads off one GST notice</h2>
            <p className="muted measure">
              A sample Form GST ASMT-10, one page, typed. This is what the default profile finds in it, field by
              field.
            </p>
            <div className="table-scroll" style={{ marginTop: 24 }}>
              <table className="table">
                <tbody>
                  {READ_OFF.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
          <Shot src="notice.png"
                alt="The GST notice open in Dueproof, with its reference, issuing office, amount, reply deadline and hearing listed beside the page"
                caption="The same notice in the app. Choosing an entry outlines its sentence on the page." />
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <div className="section-head">
            <h2>Why you can check every entry</h2>
            <p>
              Dueproof never paraphrases its way to a date. Each entry keeps the sentence it came from, and that
              sentence is located on the page by its words, not by a guess.
            </p>
          </div>
          <div className="facts">
            <div className="fact"><h3>Exact, strong, approximate or not found</h3><p>Each outline says how well the passage matched the page. When nothing matches well enough, there is no outline and you are told so.</p></div>
            <div className="fact"><h3>Original wording is the proof</h3><p>For a Hindi or Tamil notice the English is a working translation, labelled as one. The outline is on the original.</p></div>
            <div className="fact"><h3>Translations are checked</h3><p>If a translation seems to have dropped a number or a known term, the entry is flagged for you to check.</p></div>
            <div className="fact"><h3>Measured, not promised</h3><p>The test suite fails if any finding is outlined confidently in the wrong place. Run <code>dueproof eval</code> on your own labelled notices.</p></div>
          </div>
        </div>
      </section>

      <section className="band band-paper">
        <div className="wrap">
          <div className="section-head">
            <h2>From a list of dates to work that gets done</h2>
          </div>
          <Shot src="deadlines.png"
                alt="The deadline list: obligations in date order, overdue ones marked, each linked to its page"
                caption="The deadline list, in the order things fall due. Overdue items are marked in amber." />
          <div className="facts" style={{ marginTop: 40 }}>
            {WORK.map(([h, p]) => <div className="fact" key={h}><h3>{h}</h3><p>{p}</p></div>)}
          </div>
        </div>
      </section>

      <section className="band">
        <div className="wrap split split-wide">
          <div className="measure">
            <h2 style={{ marginBottom: 16 }}>Notices that are not in English</h2>
            <p className="lede">
              Text in an Indian language is translated into English on your own machine, so the same rules find
              the same duties. The outline stays on the original words.
            </p>
            <p className="muted">
              A circular with a Malayalam paragraph produces dated entries without anyone writing Malayalam
              rules. <Link href="/languages/">Which languages are supported</Link>.
            </p>
          </div>
          <Shot src="bilingual.png"
                alt="A circular with Malayalam text: findings translated into English, the Malayalam passage outlined on page 3"
                caption="Translated findings are labelled. The Malayalam passage is outlined on the page and quoted beneath it." />
        </div>
      </section>

      <section className="band band-paper">
        <div className="wrap">
          <div className="section-head">
            <h2>Made to fit your notices</h2>
            <p>
              A profile is a plain Python file of word lists: your desks, the kinds of notice you receive, who
              issues them and how they phrase a deadline. The default covers Indian tax, corporate, labour,
              regulatory and court notices.
            </p>
          </div>
          <div className="actions">
            <Link className="btn btn-ink" href="/docs/profiles/">Write a profile</Link>
            <Link className="btn btn-line" href="/docs/notices/">What a notice yields</Link>
          </div>
        </div>
      </section>
    </>
  );
}
