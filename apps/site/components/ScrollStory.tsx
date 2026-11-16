"use client";

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { COMPUTED, NOTICE } from "@/lib/sample";
import { m, MotionProvider, type MotionValue, useMotionValue, useScroll, useTransform } from "@/lib/motion";
import { AmountIcon, CalendarCheckIcon, GstIcon, HearingIcon, ProofIcon, VerifiedIcon } from "./icons";
import { NoticePaper } from "./NoticePaper";
import { DueChip } from "./ui";

/**
 * The home page story (02 §7, "Website hero"): a notice arrives, gets read,
 * its deadline sentence is outlined on the page, and it lands in the register
 * with the computed date and its basis. Scroll-linked; with reduced motion
 * the same scene is shown as four still frames instead.
 */

const STEPS = [
  {
    title: "A notice arrives.",
    body: "From a portal download, an email, a scan or a photo from a client's phone. Dueproof records the day it reached you, because many deadlines count from receipt.",
  },
  {
    title: "It gets read, every word.",
    body: "Text and word positions come off the page, then rules (and the model, if you turned AI on) propose what the notice asks for: the kind of notice, sections, amounts, hearings.",
  },
  {
    title: "The deadline is proved on the page.",
    body: "A finding counts only when its exact sentence is found on the page. That sentence is outlined, so anyone can check it in a second.",
  },
  {
    title: "It lands in the register, with its working.",
    body: "Code, not a model, computes the date from the rule and the receipt date. The entry shows both, and links back to the outline.",
  },
] as const;

/** Frame positions for the still version. */
const STILLS = [0.22, 0.47, 0.7, 1];

export function ScrollStory() {
  return (
    <MotionProvider>
      <section className="story" aria-labelledby="story-title">
        <h2 id="story-title" className="sr-only">
          From notice to register, in four steps
        </h2>
        <Live />
        <Stills />
      </section>
    </MotionProvider>
  );
}

function Live() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  return (
    <div ref={ref} className="story-live" style={{ height: "100%" }}>
      <div className="story-stage">
        <div className="wrap story-grid">
          <div>
            <div className="story-rail" aria-hidden="true">
              {STEPS.map((s, i) => (
                <RailSegment key={s.title} p={scrollYProgress} i={i} />
              ))}
            </div>
            <ol className="story-captions" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {STEPS.map((s, i) => (
                <Caption key={s.title} p={scrollYProgress} i={i}>
                  <span className="step-no">Step {i + 1} of 4</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </Caption>
              ))}
            </ol>
          </div>
          <Viewport label="Animation: the sample GST notice moving from arrival to the deadline register.">
            {(narrow) => <Scene p={scrollYProgress} narrow={narrow} />}
          </Viewport>
        </div>
      </div>
    </div>
  );
}

function Stills() {
  return (
    <div className="story-static">
      <div className="wrap">
        <div className="section-head">
          <p className="overline">How a notice becomes a deadline</p>
          <p className="h2">Four steps, from the post to the register.</p>
        </div>
        <ol className="frames">
          {STEPS.map((s, i) => (
            <li className="frame" key={s.title}>
              <Still p={STILLS[i]} />
              <div>
                <p className="fine">Step {i + 1} of 4</p>
                <h3 className="h3">{s.title}</h3>
                <p className="muted small">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Still({ p }: { p: number }) {
  const value = useMotionValue(p);
  return (
    <Viewport label="">
      {(narrow) => <Scene p={value} narrow={narrow} />}
    </Viewport>
  );
}

function RailSegment({ p, i }: { p: MotionValue<number>; i: number }) {
  const scaleX = useTransform(p, [i * 0.25, (i + 1) * 0.25], [0, 1]);
  return (
    <span>
      <m.i style={{ scaleX }} />
    </span>
  );
}

function Caption({ p, i, children }: { p: MotionValue<number>; i: number; children: ReactNode }) {
  const s = i * 0.25;
  const input = i === 0 ? [0, 0.2, 0.25] : i === 3 ? [0.72, 0.77, 1] : [s - 0.03, s + 0.02, s + 0.2, s + 0.25];
  const output = i === 0 ? [1, 1, 0] : i === 3 ? [0, 1, 1] : [0, 1, 1, 0];
  const opacity = useTransform(p, input, output);
  const y = useTransform(p, input, output.map((o) => (1 - o) * 12));
  return (
    <m.li className="story-caption" style={{ opacity, y }}>
      {children}
    </m.li>
  );
}

/** Fits the fixed-size scene into whatever space the layout gives it. */
function Viewport({ label, children }: { label: string; children: (narrow: boolean) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, narrow: false });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      const narrow = width < 560;
      const [w, h] = narrow ? [400, 560] : [672, 544];
      setFit({ scale: Math.min(width / w, height / h, 1.2), narrow });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="story-viewport" role={label ? "img" : undefined} aria-label={label || undefined}>
      <div
        className={`story-canvas${fit.narrow ? " narrow" : ""}`}
        style={{ scale: String(fit.scale) }}
        aria-hidden="true"
      >
        {children(fit.narrow)}
      </div>
    </div>
  );
}

function Scene({ p, narrow }: { p: MotionValue<number>; narrow: boolean }) {
  // 1. Arrives: the page slides up and settles; the receipt stamp lands.
  const paperY = useTransform(p, [0, 0.16, 0.74, 0.88], [460, 0, 0, narrow ? -8 : 12]);
  const paperRotate = useTransform(p, [0, 0.16, 0.74, 0.88], [8, -1.5, -1.5, -3]);
  const paperOpacity = useTransform(p, [0, 0.07], [0, 1]);
  const paperScale = useTransform(p, [0.74, 0.88], [1, narrow ? 0.62 : 0.72]);
  const stampOpacity = useTransform(p, [0.14, 0.19], [0, 1]);
  const stampScale = useTransform(p, [0.14, 0.2], [1.9, 1]);

  // 2. Read: a scan passes down the page; what it found appears beside it.
  const scanTop = useTransform(p, [0.27, 0.45], ["-12%", "100%"]);
  const scanOpacity = useTransform(p, [0.25, 0.27, 0.44, 0.47], [0, 1, 1, 0]);

  // 3. Proof: the deadline sentence is highlighted, then outlined.
  const hlScale = useTransform(p, [0.53, 0.62], [0, 1]);
  const olOpacity = useTransform(p, [0.6, 0.64], [0, 1]);
  const tagOpacity = useTransform(p, [0.62, 0.66], [0, 1]);
  const tagY = useTransform(p, [0.62, 0.66], [6, 0]);

  // 4. Register: the page steps back and the entry is written in.
  const regOpacity = useTransform(p, [0.78, 0.86], [0, 1]);
  const regX = useTransform(p, [0.78, 0.9], [narrow ? 0 : 90, 0]);
  const regY = useTransform(p, [0.78, 0.9], [narrow ? 60 : 0, 0]);
  const rowOpacity = useTransform(p, [0.86, 0.92], [0, 1]);
  const rowY = useTransform(p, [0.86, 0.92], [-14, 0]);
  const rowGlow = useTransform(p, [0.9, 0.96], [0, 1]);

  return (
    <>
      <m.div
        className="story-paper"
        style={{ y: paperY, rotate: paperRotate, opacity: paperOpacity, scale: paperScale }}
      >
        <NoticePaper
          style={{ height: "31rem", overflow: "hidden" }}
          stamp={
            <m.span className="stamp" style={{ opacity: stampOpacity, scale: stampScale, rotate: -6 }}>
              Received
              <b>{COMPUTED.received}</b>
            </m.span>
          }
          proof={
            <p className="proof-box">
              <m.span className="hl" style={{ scaleX: hlScale }} />
              <m.span className="ol" style={{ opacity: olOpacity }} />
              <m.span className="proof-tag" style={{ opacity: tagOpacity, y: tagY }}>
                <ProofIcon size={12} strokeWidth={2} /> Exact match · page 1
              </m.span>
              {NOTICE.proof}
            </p>
          }
        />
        <m.div className="story-scan" style={{ top: scanTop, opacity: scanOpacity }} />
      </m.div>

      <div className="story-chips">
        <Chip p={p} at={0.3} icon={<GstIcon size={18} />} label="Kind" value="GST ASMT-10 · scrutiny" />
        <Chip p={p} at={0.34} icon={<AmountIcon size={18} />} label="Amount" value={`${COMPUTED.amount} (${COMPUTED.amountWords})`} />
        <Chip p={p} at={0.38} icon={<HearingIcon size={18} />} label="Hearing" value={COMPUTED.hearing} />
        <Chip
          p={p}
          at={0.6}
          icon={<CalendarCheckIcon size={18} />}
          label="Deadline rule"
          value="Within 30 days of receipt"
          proof
        />
      </div>

      <m.div className="story-register" style={{ opacity: regOpacity, x: regX, y: regY }}>
        <div className="window">
          <div className="window-bar">
            <span className="dots" aria-hidden="true"><i /><i /><i /></span>
            Deadlines
            <span className="muted">Harbour Valley Components</span>
          </div>
          <m.div className="reg-row is-new" style={{ opacity: rowOpacity, y: rowY }}>
            <m.span aria-hidden="true" className="row-glow" style={{ opacity: rowGlow }} />
            <span className="t">Reply to GST ASMT-10 and pay with interest</span>
            <span>
              <DueChip state="later" label="Due" detail={COMPUTED.due} size="sm" />
            </span>
            <span className="s">
              <span className="basis">{COMPUTED.rule} · received {COMPUTED.received}</span>
              <span>
                <VerifiedIcon size={13} className="proof-ic" /> Proof: page 1, exact
              </span>
              <span>{COMPUTED.amount}</span>
            </span>
          </m.div>
          <div className="reg-row">
            <span className="t">Personal hearing, Division office</span>
            <DueChip state="week" detail="18 Nov 2026" size="sm" />
            <span className="s">
              <span className="basis">Date written in the notice, 11:00</span>
            </span>
          </div>
          <div className="reg-row">
            <span className="t">Furnish documents, notice u/s 143(2)</span>
            <DueChip state="done" detail="4 Nov 2026" size="sm" />
            <span className="s">
              <span className="basis">“On or before 4 November 2026”</span>
            </span>
          </div>
        </div>
      </m.div>
    </>
  );
}

function Chip({
  p,
  at,
  icon,
  label,
  value,
  proof = false,
}: {
  p: MotionValue<number>;
  at: number;
  icon: ReactNode;
  label: string;
  value: string;
  proof?: boolean;
}) {
  const opacity = useTransform(p, [at, at + 0.03, 0.72, 0.76], [0, 1, 1, 0]);
  const x = useTransform(p, [at, at + 0.04], [24, 0]);
  return (
    <m.div className={proof ? "chip chip-proof" : "chip"} style={{ opacity, x }}>
      {icon}
      <span>
        <small>{label}</small>
        {value}
      </span>
    </m.div>
  );
}
