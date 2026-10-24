import Link from "next/link";
import { Install } from "@/components/Install";
import { ReceiptClock } from "@/components/ReceiptClock";
import { Register } from "@/components/Register";
import { LANGUAGES, RTL } from "@/lib/languages";
import { REPO } from "@/lib/site";

const PEOPLE = [
  {
    who: "Associates at CA firms",
    forms: ["ASMT-10", "DRC-01", "143(2)", "TDS"],
    load: "Hundreds of clients, each with GST, income-tax and TDS logins. Notices arrive by email, by post and as photos forwarded on WhatsApp.",
    gets: "One register across every client, sorted by what is due first, each date traceable to the line that set it.",
  },
  {
    who: "Company secretaries",
    forms: ["ROC", "Sec. 454", "SEBI", "LODR"],
    load: "ROC letters, stock-exchange queries, RBI and SEBI circulars. Each needs an owner and a date the board can see.",
    gets: "An owner and a status on every duty, a weekly email of what is due, and a history of every change.",
  },
  {
    who: "Compliance teams at lenders and NBFCs",
    forms: ["RBI circular", "Summons", "7A", "Show cause"],
    load: "Circulars in English, orders and summons in regional languages, and auditors who ask how you knew.",
    gets: "Indian-language notices read on your own server, with the original wording kept as the proof.",
  },
];

const STEPS = [
  ["Read", "Typed PDFs are read directly. Scans and phone photos are straightened and run through OCR."],
  ["Translate", "Indian-language text is translated on your machine by IndicTrans2, so one set of rules reads every language."],
  ["Find", "Rules pick out duties, deadlines, hearings, amounts, reference numbers and the sections cited."],
  ["Prove", "Each finding is outlined on its page. If the passage can't be found, Dueproof says so rather than guess."],
  ["Track", "Give each duty an owner, correct a date, mark it done. Every change is kept, and a weekly email lists what is due."],
];

const NEVER = [
  ["Send your documents to a cloud service", "Running on your own machine is the point."],
  ["Act on its own", "No replies filed and no payments made. Dueproof proposes; a person decides."],
  ["Replace the rules with a model", "Being able to say why a sentence was flagged is the product."],
  ["Rewrite a translation to “fix” it", "A doubtful translation is flagged, and the original is shown."],
  ["Guess where a passage is", "If it can't be located on the page, you are told so."],
  ["Hide what it got wrong", "Corrections are kept beside the original reading, and can be exported to measure accuracy."],
];

export default function Home() {
  const scans = LANGUAGES.filter((l) => l.scans).length;
  const ribbon = [...LANGUAGES, ...LANGUAGES];
  return (
    <>
      <section className="hero cloth">
        <div className="wrap hero-grid">
          <h1>Know what every notice asks of you, and by when.</h1>
          <div>
            <p className="lede">
              Dueproof reads tax, regulatory and court notices in <strong>English and 22 Indian languages</strong>,
              and keeps one register of what is owed and when. Every entry is outlined on the page it came from.
              It runs on <strong>your own server</strong>.
            </p>
            <div className="actions">
              <Link className="btn btn-gilt" href="/docs/install/">Install it free</Link>
              <Link className="btn btn-line" href="/product/">See how it reads a notice</Link>
            </div>
            <p className="hero-foot small">Open source, Apache 2.0. Version 0.1 is early: run it beside your current process first.</p>
          </div>
        </div>
        <div className="wrap register-wrap">
          <div className="stack"><Register /></div>
          <p className="under-register small">
            Choose an entry to see the page it came from. Three sample notices gave four entries: the GST notice asks
            for a reply and fixes a hearing.
          </p>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <div className="section-head">
            <h2>For the people who keep the register</h2>
            <p>Anyone who receives notices on someone else's behalf, and answers for it when a date slips.</p>
          </div>
          <div className="people">
            {PEOPLE.map((p) => (
              <article className="person" key={p.who}>
                <div className="forms" aria-label="Notices they handle">
                  {p.forms.map((f) => <span className="form-chip" key={f}>{f}</span>)}
                </div>
                <h3>{p.who}</h3>
                <p>{p.load}</p>
                <p className="gets">{p.gets}</p>
              </article>
            ))}
          </div>
          <p style={{ marginTop: 28 }}><Link href="/use-cases/">The notices it knows, desk by desk</Link></p>
        </div>
      </section>

      <section className="band cloth">
        <div className="wrap">
          <div className="section-head">
            <h2>How a notice becomes an entry</h2>
            <p>No language model and no cloud service. Rules you can read, and a page you can check.</p>
          </div>
          <ol className="steps">
            {STEPS.map(([title, text]) => <li key={title}><h3>{title}</h3><p>{text}</p></li>)}
          </ol>
        </div>
      </section>

      <section className="band band-paper">
        <div className="wrap split">
          <div className="measure">
            <h2 style={{ marginBottom: 22 }}>“Within 30 days of receipt” means your receipt.</h2>
            <p className="lede">
              Many notices count from the day they reach you, not the day they were signed. Dueproof records when
              each one arrived and counts from there.
            </p>
            <p className="muted">
              If the arrival date is wrong, correct it. The change is logged with your name, and the original
              reading is kept. Try it: change the date on the right.
            </p>
          </div>
          <ReceiptClock />
        </div>
      </section>

      <section className="cloth" style={{ paddingTop: "clamp(72px, 10vw, 120px)" }}>
        <div className="wrap section-head">
          <h2>22 Indian languages, read as they arrive</h2>
          <p>
            Scans and photographs are read in {scans} of them; the other {LANGUAGES.length - scans} from typed PDFs,
            because no OCR model exists for them yet. Six are tested end to end with the translation model.
          </p>
        </div>
        <div className="ribbon" aria-hidden="true">
          <div className="ribbon-track">
            {ribbon.map((l, i) => <span key={i} lang={l.code} dir={RTL.has(l.code) ? "rtl" : undefined}>{l.name}</span>)}
          </div>
        </div>
        <div className="wrap" style={{ paddingBlock: "48px clamp(72px, 10vw, 120px)" }}>
          <div className="langs">
            {LANGUAGES.map((l) => (
              <div className={`lang${l.scans ? "" : " is-typed"}`} key={l.code}>
                <span className="endonym" lang={l.code} dir={RTL.has(l.code) ? "rtl" : undefined}>{l.name}</span>
                <span className="english">{l.english}</span>
                {!l.scans && <span className="reads">Typed PDFs only</span>}
              </div>
            ))}
          </div>
          <p style={{ marginTop: 28 }}><Link href="/languages/">What each language supports</Link></p>
        </div>
      </section>

      <section className="band">
        <div className="wrap split">
          <div className="measure">
            <h2 style={{ marginBottom: 22 }}>Your notices stay in your office</h2>
            <p className="lede">
              One Python service and one database file on a machine you control. Nothing is sent anywhere: no
              cloud service, no API key, no telemetry.
            </p>
            <div className="facts" style={{ marginTop: 28 }}>
              <div className="fact"><h3>Sign-in</h3><p>Built-in accounts, or your own single sign-on in front.</p></div>
              <div className="fact"><h3>Backups</h3><p>One command to back up, verify and restore.</p></div>
              <div className="fact"><h3>Accuracy</h3><p><code>dueproof eval</code> measures it on your own documents.</p></div>
            </div>
          </div>
          <Install />
        </div>
      </section>

      <section className="band cloth">
        <div className="wrap">
          <div className="section-head"><h2>What it will never do</h2></div>
          <ul className="never">
            {NEVER.map(([title, text]) => <li key={title}><strong>{title}</strong><span className="muted">{text}</span></li>)}
          </ul>
        </div>
      </section>

      <section className="band band-paper">
        <div className="wrap split">
          <div className="section-head" style={{ margin: 0 }}>
            <h2>Try it beside your current process</h2>
            <p>
              Run it for a month on the notices you already track by hand, then compare the two registers. If
              Dueproof missed something, tell us what it was.
            </p>
          </div>
          <div className="actions" style={{ justifyContent: "flex-end" }}>
            <Link className="btn btn-ink" href="/docs/quickstart/">Read the quickstart</Link>
            <a className="btn btn-line" href={REPO}>View the source on GitHub</a>
          </div>
        </div>
      </section>
    </>
  );
}
