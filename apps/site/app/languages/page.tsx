import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons";
import { PageHero } from "@/components/PageHero";
import { LANGUAGES } from "@/lib/languages";

export const metadata: Metadata = { title: "Languages" };

const SCRIPTS = [...new Set(LANGUAGES.map((l) => l.script))];

export default function Languages() {
  return (
    <>
      <PageHero overline="Languages" title="English and 22 Indian languages.">
        <p>
          Every language in the Eighth Schedule. A notice is read in the language it was written in,
          and the outline always lands on the original words. The English beside it is a working
          translation, labelled as one.
        </p>
      </PageHero>

      <section className="band band-canvas" aria-labelledby="all-title">
        <div className="wrap">
          <div className="section-head section-head-wide">
            <h2 id="all-title" className="h2">
              {LANGUAGES.length} languages, {SCRIPTS.length} scripts.
            </h2>
            <p className="muted">
              Each script is set in its own Noto typeface, loaded only when a page shows it. Urdu,
              Kashmiri and Sindhi are set right to left.
            </p>
          </div>
          <ul className="lang-grid">
            {LANGUAGES.map((l) => (
              <li className="lang" key={l.code}>
                <span className="native" lang={l.code} dir={l.rtl ? "rtl" : undefined}>
                  {l.name}
                </span>
                <span className="meta">
                  <span>{l.english}</span>
                  <span>{l.script}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="band" aria-labelledby="how-title">
        <div className="wrap">
          <div className="section-head">
            <p className="overline">How it reads them</p>
            <h2 id="how-title" className="h2">
              The original is always the proof.
            </h2>
          </div>
          <ul className="rule-list">
            <li>
              <span>Translated offline by default</span>
              <span className="muted">
                Indian-language text is translated into English on the same server with IndicTrans2,
                so the same rules find the same duties in any language and nothing leaves the
                building.
              </span>
            </li>
            <li>
              <span>Read directly when AI is on</span>
              <span className="muted">
                With AI on, the model reads the original language directly. Its findings still have
                to be found on the page before they can become a deadline. Model translation is
                flagged as such.
              </span>
            </li>
            <li>
              <span>Scans and photographs</span>
              <span className="muted">
                Pages without a text layer go through an OCR ladder: PDFium for text-layer PDFs,
                then PaddleOCR, then Tesseract, then a vision model for the hardest pages. Which
                tool reads which script best is being measured on real notices.{" "}
                <span className="verify">verify</span> We will publish the results per language
                rather than claim them here.
              </span>
            </li>
            <li>
              <span>When a script can't be read offline</span>
              <span className="muted">
                The original is still shown and searchable, marked "translation unavailable". You
                can turn AI on for that notice, or read the original.
              </span>
            </li>
            <li>
              <span>The interface</span>
              <span className="muted">
                The app itself is in English in v0.1. Interface translation into Indian and other
                languages is planned for 0.3; every string is in message files from day one.
              </span>
            </li>
          </ul>
          <p style={{ marginTop: "var(--dp-space-40)" }}>
            <Link className="text-link" href="/docs/languages/">
              Languages in the documentation <ArrowRightIcon size={16} />
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
