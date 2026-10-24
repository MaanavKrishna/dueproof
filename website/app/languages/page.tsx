import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle } from "@/components/PageTitle";
import { LANGUAGES, RTL } from "@/lib/languages";

export const metadata: Metadata = { title: "Languages" };

const SCRIPT: Record<string, string> = {
  hi: "Devanagari", bn: "Bengali", mr: "Devanagari", te: "Telugu", ta: "Tamil", gu: "Gujarati",
  ur: "Arabic", kn: "Kannada", or: "Odia", ml: "Malayalam", pa: "Gurmukhi", as: "Bengali",
  mai: "Devanagari", sat: "Ol Chiki", ks: "Arabic", ne: "Devanagari", sd: "Arabic",
  kok: "Devanagari", doi: "Devanagari", mni: "Meetei Mayek", brx: "Devanagari", sa: "Devanagari",
};

export default function Languages() {
  const tested = LANGUAGES.filter((l) => l.tested).map((l) => l.english);
  return (
    <>
      <PageTitle title="English and 22 Indian languages">
        <p>
          Every language in the Eighth Schedule. Text is translated into English on your own machine by
          IndicTrans2, so one set of rules reads them all, and the outline always lands on the original words.
        </p>
      </PageTitle>

      <section className="band band-paper">
        <div className="wrap">
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Language</th>
                  <th scope="col">Script</th>
                  <th scope="col">Typed PDFs</th>
                  <th scope="col">Scans and photos</th>
                  <th scope="col">Tested end to end</th>
                </tr>
              </thead>
              <tbody>
                {LANGUAGES.map((l) => (
                  <tr key={l.code}>
                    <th scope="row">
                      <span className="script" lang={l.code} dir={RTL.has(l.code) ? "rtl" : undefined}
                            style={{ fontSize: "1.2rem", marginRight: 10 }}>{l.name}</span>
                      {l.english}
                    </th>
                    <td>{SCRIPT[l.code]}</td>
                    <td>Yes</td>
                    <td>{l.scans ? "Yes" : <span className="muted">No OCR model yet</span>}</td>
                    <td>{l.tested ? "Yes" : <span className="muted">Not yet</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ marginTop: 14 }}>
            Tested end to end with the real translation model: {tested.join(", ")}. The others use the same path;
            if you try one, please report what you find.
          </p>
        </div>
      </section>

      <section className="band">
        <div className="wrap split">
          <div className="measure">
            <h2 style={{ marginBottom: 16 }}>Two things to know</h2>
            <h3 style={{ margin: "24px 0 8px" }}>Languages that share a script</h3>
            <p className="muted">
              Dueproof tells languages apart by script. Hindi, Marathi, Nepali, Sanskrit, Konkani, Maithili, Dogri
              and Bodo all use Devanagari, so among the languages you switch on, the first one listed claims the
              script. <code>DUEPROOF_LANGUAGES=mr,ta</code> reads Devanagari as Marathi.
            </p>
            <h3 style={{ margin: "24px 0 8px" }}>Without the translation model</h3>
            <p className="muted">
              The model's weights are a separate, licence-gated download. Without them, Indian-language text is
              still read, searched and shown, but duties are found only through words your profile lists in that
              language.
            </p>
          </div>
          <div>
            <pre className="terminal"><span className="c"># Switch languages on when you start it</span>{"\n"}DUEPROOF_LANGUAGES=hi,ta,bn dueproof serve{"\n\n"}<span className="c"># or all 22</span>{"\n"}DUEPROOF_LANGUAGES=all dueproof serve</pre>
            <p style={{ marginTop: 20 }}><Link href="/docs/languages/">Languages in the documentation</Link></p>
          </div>
        </div>
      </section>
    </>
  );
}
