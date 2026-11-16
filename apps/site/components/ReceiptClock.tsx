"use client";

import { useState } from "react";

const ISSUED = "2026-10-20";
const DAYS = 30;
const DAY = 86_400_000;

const parse = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const show = (ms: number) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(ms);

/** "Within 30 days of receipt" counts from the day it reached you. */
export function ReceiptClock() {
  const [received, setReceived] = useState("2026-10-24");
  const start = Math.max(parse(received) || parse(ISSUED), parse(ISSUED));
  const due = start + DAYS * DAY;
  const naive = parse(ISSUED) + DAYS * DAY;
  const gap = Math.round((due - naive) / DAY);

  return (
    <div className="clock">
      <blockquote>
        <span className="proof-mark">
          “…pay the tax of Rs. 4,52,300 with interest within 30 days of receipt of this notice.”
        </span>
        <br />
        <span className="fine">Sample notice dated 20 Oct 2026</span>
      </blockquote>
      <label htmlFor="received">The notice reached you on</label>
      <input
        id="received"
        type="date"
        value={received}
        min={ISSUED}
        max="2026-12-31"
        onChange={(e) => setReceived(e.target.value)}
      />
      <dl aria-live="polite">
        <dt>Reply due</dt>
        <dd className="due">{show(due)}</dd>
        <dt>Rule</dt>
        <dd>30 days from receipt</dd>
        <dt>Counted from the notice date instead</dt>
        <dd>
          {show(naive)}
          {gap > 0 && (
            <span className="fine">
              {" "}
              ({gap} {gap === 1 ? "day" : "days"} too early)
            </span>
          )}
        </dd>
      </dl>
    </div>
  );
}
