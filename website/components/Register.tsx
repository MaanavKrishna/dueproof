"use client";

import { useEffect, useRef, useState } from "react";
import { ENTRIES, type Entry } from "@/lib/register";

const ROW_GAP = 0.28;           // seconds between rows being written
const WRITE = 0.55;             // seconds to write one row

/** The sample inward register. Rows are written in once, when the book is
 *  first seen; choosing a row shows the page it came from, outlined. */
export function Register() {
  const book = useRef<HTMLDivElement>(null);
  const [chosen, setChosen] = useState(2);
  const [phase, setPhase] = useState<"idle" | "writing" | "proving">("idle");

  useEffect(() => {
    const el = book.current;
    if (!el) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return setPhase("proving");
    let timer = 0;
    const seen = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      seen.disconnect();
      setPhase("writing");
      timer = window.setTimeout(() => setPhase("proving"), (ENTRIES.length * ROW_GAP + WRITE) * 1000);
    }, { threshold: 0.3 });
    seen.observe(el);
    return () => { seen.disconnect(); clearTimeout(timer); };
  }, []);

  const choose = (i: number) => { setChosen(i); setPhase("proving"); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const next = (chosen + (e.key === "ArrowDown" ? 1 : ENTRIES.length - 1)) % ENTRIES.length;
    choose(next);
    book.current?.querySelectorAll<HTMLButtonElement>(".row-btn")[next]?.focus();
  };

  const entry = ENTRIES[chosen];
  const cls = ["register", phase === "writing" && "is-writing", phase === "proving" && "is-proving"]
    .filter(Boolean).join(" ");

  return (
    <div className={cls} ref={book} id="register">
      <div className="book">
        <div className="book-title">
          <strong>Inward register</strong>
          <span className="muted small">Harbour Valley Components, 2026</span>
        </div>
        <table className="ledger" onKeyDown={onKey}>
          <caption className="sr-only">Notices received, with what each one asks and by when. Choose a row to see its page.</caption>
          <thead>
            <tr>
              <th scope="col">No.</th>
              <th scope="col" className="col-received">Received</th>
              <th scope="col">Subject</th>
              <th scope="col" className="col-desk">Desk</th>
              <th scope="col">Due</th>
            </tr>
          </thead>
          <tbody>
            {ENTRIES.map((e, i) => (
              <tr key={e.no} aria-selected={i === chosen} onClick={() => choose(i)}>
                {cells(e, i === chosen, i)}
              </tr>
            ))}
            {[0, 1, 2, 3, 4].map((k) => (
              <tr className="empty" key={k} aria-hidden="true"><td /><td className="col-received" /><td /><td className="col-desk" /><td /></tr>
            ))}
          </tbody>
        </table>
      </div>
      <Sheet entry={entry} key={entry.no} />
    </div>
  );
}

function cells(e: Entry, chosen: boolean, row: number) {
  const delay = (col: number) => ({ animationDelay: `${row * ROW_GAP + col * 0.05}s` });
  return (
    <>
      <td className="num" style={delay(0)}>{e.no}</td>
      <td className="col-received num" style={delay(1)}>{e.received}</td>
      <td style={delay(2)}>
        <button className="row-btn" aria-pressed={chosen}>
          {e.subject}{e.translated && <span className="tag">हिन्दी</span>}
        </button>
        <span className="sub">{e.from}</span>
      </td>
      <td className="col-desk" style={delay(3)}>{e.desk}</td>
      <td className="due num" style={delay(4)}>{e.due}</td>
    </>
  );
}

function Sheet({ entry }: { entry: Entry }) {
  return (
    <div className="sheet" aria-live="polite">
      <div className="sheet-label">
        <span>Entry {entry.no}, page 1 of the notice</span>
        <span>Sample notice</span>
      </div>
      <div className="page" lang={entry.page.lang}>
        <span className="stamp" aria-hidden="true"><span>Received</span><b className="num">{entry.received}</b><span>Inward No. {entry.no}</span></span>
        <div className="page-head">
          {entry.page.head.map((line) => <p key={line}>{line}</p>)}
        </div>
        {entry.page.body.map((para, i) => (
          <p key={i}>
            {para.map((seg, j) => typeof seg === "string"
              ? <span key={j}>{seg}</span>
              : <mark key={j} className="proof">{seg.proof}</mark>)}
          </p>
        ))}
      </div>
      <dl className="finding">
        <dt>Duty</dt><dd>{entry.duty}{entry.translated && <span className="tag">translated</span>}</dd>
        <dt>Due</dt><dd><span className="due">{entry.due}</span> <span className="muted">({entry.basis})</span></dd>
        {entry.amount && <><dt>Amount</dt><dd className="num">{entry.amount}</dd></>}
        <dt>Desk</dt><dd>{entry.desk}</dd>
      </dl>
    </div>
  );
}
