import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle } from "@/components/PageTitle";

export const metadata: Metadata = { title: "Who it's for" };

const TEAMS = [
  {
    who: "CA and CS firms",
    situation:
      "Every client brings its own GST, income-tax, TDS and MCA logins, and its own notices. Partners want to know what is due this week across all of them; associates want to stop copying dates into a spreadsheet.",
    how: [
      "Drop notices in as they arrive: portal downloads, email attachments, phone photos of posted letters.",
      "Each notice is filed by kind and routed to a desk; each duty gets a date, counted from receipt where the notice says so.",
      "Associates own items; the weekly email tells each one what is due. Partners see the whole register.",
    ],
  },
  {
    who: "In-house company secretaries",
    situation:
      "Letters from the Registrar of Companies, stock-exchange queries, SEBI and RBI circulars. The board asks who is handling each one, and the auditors ask when you first knew.",
    how: [
      "The date each notice reached you is recorded, and every later correction is kept with a name and a time.",
      "Findings carry the provision cited, so a reply can quote it.",
      "The evidence report prints each duty with its passage cropped from the page.",
    ],
  },
  {
    who: "Compliance teams at lenders and NBFCs",
    situation:
      "Regulatory circulars in English, orders and summons in the language of the state that issued them, and no permission to send any of it to a cloud service.",
    how: [
      "Everything runs on your server. Translation runs on the same machine.",
      "Circulars are routed to the Regulatory desk; summons and orders to Legal.",
      "Accuracy can be measured on your own labelled documents before anyone relies on it.",
    ],
  },
];

// The default profile, dueproof/profiles/notices_in.py.
const DESKS = [
  ["GST & Indirect Tax", "ASMT-10, DRC-01 and DRC-01A, REG-17, notices under sections 61, 73 and 74"],
  ["Direct Tax", "Income-tax notices under sections 142(1), 143(2), 148 and 148A; TDS notices"],
  ["Corporate Secretarial", "Registrar of Companies and MCA notices, adjudication under section 454"],
  ["Payroll & Labour", "EPFO and ESIC notices, summons under section 7A, damages under 14B"],
  ["Regulatory", "RBI master directions and circulars, SEBI, IRDAI and PFRDA circulars"],
  ["Legal & Litigation", "Show-cause notices, court and tribunal orders, summons, legal notices"],
  ["Finance & Accounts", "Demand notices, including section 156 and DRC-07"],
  ["Administration", "Anything else, until you teach it otherwise"],
];

export default function UseCases() {
  return (
    <>
      <PageTitle title="Who it's for">
        <p>
          People who receive notices on someone else's behalf and answer for it when a date slips. Dueproof is
          built for Indian tax, corporate, labour, regulatory and court notices first.
        </p>
      </PageTitle>

      <section className="band band-paper">
        <div className="wrap people">
          {TEAMS.map((t) => (
            <div className="person" key={t.who}>
              <h2 style={{ fontSize: "1.7rem" }}>{t.who}</h2>
              <div>
                <p>{t.situation}</p>
                <ul style={{ margin: "16px 0 0", paddingLeft: "1.1em" }}>
                  {t.how.map((h) => <li key={h} style={{ marginBottom: 8 }}>{h}</li>)}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <div className="section-head">
            <h2>The notices it knows, desk by desk</h2>
            <p>
              The default profile recognises these and files each to a desk. Rename the desks, add your own kinds
              of notice, or start a profile for a different line of work.
            </p>
          </div>
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th scope="col">Desk</th><th scope="col">Notices filed there</th></tr></thead>
              <tbody>{DESKS.map(([d, n]) => <tr key={d}><th scope="row">{d}</th><td>{n}</td></tr>)}</tbody>
            </table>
          </div>
          <p style={{ marginTop: 24 }}>
            Hospitals, municipalities and metro rail operators have starter profiles too. <Link href="/docs/profiles/">Profiles</Link>.
          </p>
        </div>
      </section>

      <section className="band cloth">
        <div className="wrap">
          <div className="section-head">
            <h2>When it is not the right tool</h2>
            <p>Better to know now than after a month of trying.</p>
          </div>
          <ul className="never">
            <li><strong>Handwritten notices</strong><span className="muted">Not read yet. A review queue for them is on the roadmap.</span></li>
            <li><strong>Word files and email bodies</strong><span className="muted">PDFs and images only, for now. DOCX and email are planned for 0.3.</span></li>
            <li><strong>Tracking which laws apply to you</strong><span className="muted">Dueproof reads what arrives. A compliance calendar of statutory filings is a different product.</span></li>
            <li><strong>Hands-off automation</strong><span className="muted">It proposes; a person decides. It never files a reply or makes a payment.</span></li>
          </ul>
        </div>
      </section>
    </>
  );
}
