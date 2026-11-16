import Link from "next/link";
import {
  AiSuggestedIcon,
  ArrowRightIcon,
  BellIcon,
  CameraIcon,
  CaseIcon,
  CheckIcon,
  DocumentIcon,
  EyeOffIcon,
  LockIcon,
  MonitorIcon,
  NoticeIcon,
  OrderIcon,
  ProofIcon,
  ReceiptIcon,
  ShieldCheckIcon,
  TranslateIcon,
  VerifiedIcon,
} from "@/components/icons";
import { NoticePaper } from "@/components/NoticePaper";
import { ScrollStory } from "@/components/ScrollStory";
import { DueChip, StatusPill } from "@/components/ui";
import { LANGUAGES } from "@/lib/languages";
import { COMPUTED } from "@/lib/sample";
import { LICENCE, REPO } from "@/lib/site";

const STAGES = [
  ["Received", "done"],
  ["Documents gathered", "done"],
  ["Draft reply", "done"],
  ["Partner approval", "now"],
  ["Filed on portal", ""],
  ["Order received", ""],
  ["Appeal", ""],
  ["Closed", ""],
] as const;

const MODES = [
  [
    "Off",
    "Rules alone read every notice. The default on a self-hosted install.",
    "Text goes nowhere.",
  ],
  [
    "Local",
    "A model server on your own network, such as Ollama, vLLM or LM Studio.",
    "Text stays on your network.",
  ],
  [
    "Your key",
    "Your own account with Anthropic, OpenAI, Google, Azure OpenAI, AWS Bedrock or any compatible endpoint.",
    "Text goes to the provider you chose, billed to you.",
  ],
  [
    "Our plan",
    "Hosted plans with AI include a monthly notice allowance. At the cap, AI stops and the rules carry on.",
    "Through a gateway that requires zero data retention.",
  ],
] as const;

const ROUTES = [
  ["No model", 60, "Where the rules are confident, no model is called at all."],
  ["Claude Haiku 5.5", 25, "Light work: triage, classification, summaries, clean digital notices."],
  ["Claude Sonnet 5.5", 13, "Most extraction: scans, photos, regional languages, Ask and drafts."],
  [
    "Claude Opus 5.5",
    2,
    "A rare escalation when dates or amounts conflict, capped at 5 % of AI calls.",
  ],
] as const;

export default function Home() {
  const scriptSample = LANGUAGES.filter((l) =>
    ["hi", "bn", "ta", "te", "mr", "gu", "kn", "ml", "pa", "or", "ur", "sat", "mni", "as"].includes(
      l.code,
    ),
  );

  return (
    <>
      {/* Hero */}
      <section className="hero">
        <div className="wrap">
          <Link className="pill-note" href="/product/">
            <b>v0.1</b> Case threads, a statutory calendar and AI behind a proof gate
            <ArrowRightIcon size={14} />
          </Link>
          <h1 className="display">
            Every deadline in your notices, <span className="accent">proved on the page.</span>
          </h1>
          <div className="hero-grid">
            <div>
              <p className="lede">
                Dueproof reads tax, regulatory and court notices in English and 22 Indian languages,
                finds what is owed and by when, and outlines each finding on the page it came from.
                A person decides; code computes every date.
              </p>
              <div className="actions">
                <a className="cta cta-primary" href="#story">
                  See a notice become a deadline
                </a>
                <Link className="cta cta-secondary" href="/pricing/">
                  Self-host free, or let us host it
                </Link>
              </div>
            </div>
            <ul className="hero-facts">
              <li>
                <ProofIcon size={18} /> Every finding outlined on its page
              </li>
              <li>
                <TranslateIcon size={18} /> English and 22 Indian languages
              </li>
              <li>
                <EyeOffIcon size={18} /> No data collection, no trackers
              </li>
              <li>
                <LockIcon size={18} /> Source-available; free to self-host
              </li>
            </ul>
          </div>
          <div className="stat-row">
            <div className="stat">
              <strong>23</strong>
              <span>languages a notice can be read in</span>
            </div>
            <div className="stat">
              <strong>0</strong>
              <span>dates written by a model. Code computes them all</span>
            </div>
            <div className="stat">
              <strong>1</strong>
              <span>place to look for proof: the page itself</span>
            </div>
            <div className="stat">
              <strong>₹</strong>
              <span>in lakh and crore, with every working shown</span>
            </div>
          </div>
        </div>
      </section>

      {/* The scroll story */}
      <div id="story">
        <ScrollStory />
      </div>

      {/* The proof */}
      <section className="band" aria-labelledby="proof-title">
        <div className="wrap">
          <div className="section-head section-head-wide">
            <p className="overline">The proof</p>
            <h2 id="proof-title" className="h2">
              If it isn't on the page, it isn't a deadline.
            </h2>
            <p className="lede">
              Every finding, from a rule or from a model, carries the exact sentence it rests on.
              Dueproof finds that sentence on the page and outlines it. If it can't, the finding is
              marked unverified and can't become a deadline until a person confirms it.
            </p>
          </div>
          <div className="proof-demo">
            <NoticePaper
              stamp={
                <span className="stamp">
                  Received<b>{COMPUTED.received}</b>
                </span>
              }
            />
            <div className="stack">
              <div className="card">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "var(--dp-space-12)",
                    alignItems: "center",
                    marginBottom: "var(--dp-space-16)",
                  }}
                >
                  <StatusPill tone="success" label="Verified on page 1" />
                  <DueChip state="later" label="Due" detail={COMPUTED.due} />
                </div>
                <p className="h4">Explain the discrepancies and pay the tax with interest</p>
                <p className="muted small" style={{ marginTop: "var(--dp-space-8)" }}>
                  {COMPUTED.rule}. Received {COMPUTED.received}, so due {COMPUTED.due}. Amount{" "}
                  {COMPUTED.amount} ({COMPUTED.amountWords}).
                </p>
              </div>
              <ul className="grades" aria-label="How well a passage matched the page">
                <li>
                  <span className="grade">
                    <i />
                    Exact
                  </span>
                  <span className="muted">The words were found on the page as written.</span>
                </li>
                <li>
                  <span className="grade strong">
                    <i />
                    Strong
                  </span>
                  <span className="muted">
                    Found with small differences, such as a line break or OCR noise.
                  </span>
                </li>
                <li>
                  <span className="grade approx">
                    <i />
                    Approximate
                  </span>
                  <span className="muted">Found loosely. Shown for a person to check.</span>
                </li>
                <li>
                  <span className="grade none">
                    <i />
                    Not located
                  </span>
                  <span className="muted">
                    No outline. The finding stays an unverified suggestion.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Indian by design */}
      <section className="band band-canvas" aria-labelledby="india-title">
        <div className="wrap">
          <div className="section-head section-head-wide">
            <p className="overline">Indian by design</p>
            <h2 id="india-title" className="h2">
              Built for the notices Indian firms actually get.
            </h2>
            <p className="lede">
              Lakh and crore, FY and AY, GSTIN, PAN, CIN and TAN, Indian holidays when counting
              working days, and notices in the language of the state that sent them.
            </p>
          </div>
          <div className="grid-2 cards">
            <div className="card">
              <div className="icon-tile">
                <TranslateIcon size={22} />
              </div>
              <h3 className="h3">22 Indian languages and English</h3>
              <p className="muted small" style={{ marginBottom: "var(--dp-space-20)" }}>
                Translated offline by default. The outline always sits on the original words; the
                English is a working translation, labelled as one.
              </p>
              <p className="scripts">
                {scriptSample.map((l) => (
                  <span key={l.code} lang={l.code} dir={l.rtl ? "rtl" : undefined}>
                    {l.name}
                  </span>
                ))}
              </p>
              <p style={{ marginTop: "var(--dp-space-20)" }}>
                <Link className="text-link" href="/languages/">
                  All languages <ArrowRightIcon size={16} />
                </Link>
              </p>
            </div>
            <div className="card">
              <div className="icon-tile">
                <ReceiptIcon size={22} />
              </div>
              <h3 className="h3">Money the way you write it</h3>
              <dl className="amounts" style={{ marginTop: "var(--dp-space-16)" }}>
                <div>
                  <dt>Tax demanded</dt>
                  <dd>₹4,52,300</dd>
                </div>
                <div>
                  <dt>The same, in words</dt>
                  <dd>₹4.52 lakh</dd>
                </div>
                <div>
                  <dt>Open demand, firm-wide</dt>
                  <dd>₹1.2 crore</dd>
                </div>
              </dl>
              <p className="fine" style={{ marginTop: "var(--dp-space-12)" }}>
                Sample figures. Thousands and millions for other countries.
              </p>
            </div>
            <div className="card">
              <div className="icon-tile">
                <BellIcon size={22} />
              </div>
              <h3 className="h3">A statutory calendar for every client</h3>
              <p className="muted small" style={{ marginBottom: "var(--dp-space-16)" }}>
                Built from each client's registrations. Due dates come from reviewed data files,
                never a model, and a practising CA signs them off before release and at each yearly
                update.
              </p>
              <p className="fine" style={{ marginBottom: "var(--dp-space-8)" }}>
                Planned for the v0.1 calendar, central taxes first:
              </p>
              <div className="forms">
                {[
                  "GSTR-1",
                  "GSTR-3B",
                  "GSTR-9",
                  "TDS payments",
                  "TDS returns",
                  "Advance tax",
                  "ITR",
                  "AOC-4",
                  "MGT-7",
                ].map((f) => (
                  <span key={f}>{f}</span>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="icon-tile">
                <DocumentIcon size={22} />
              </div>
              <h3 className="h3">Interest, with the working shown</h3>
              <p className="muted small" style={{ marginBottom: "var(--dp-space-16)" }}>
                Tax, interest and penalty as the notice states them, each outlined, plus interest
                computed to today. A computed figure is never styled like an amount quoted from the
                page.
              </p>
              <div className="workings">
                <span>
                  principal ₹4,52,300 <span className="muted">outlined, page 1</span>
                </span>
                <span>period 24 Oct 2026 → today</span>
                <span>
                  rate from the rates file <span className="muted">with its source</span>
                </span>
                <span>interest = principal × rate × days ÷ 365</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Case threads */}
      <section className="band" aria-labelledby="case-title">
        <div className="wrap">
          <div className="section-head section-head-wide">
            <p className="overline">Case threads</p>
            <h2 id="case-title" className="h2">
              A notice is the start of a case, not the end.
            </h2>
            <p className="lede">
              The reply, the filing acknowledgement, the order and any appeal sit in one thread,
              with a stage a person moves and an audit trail behind every move.
            </p>
          </div>
          <ol className="stages" aria-label="Case stages">
            {STAGES.map(([label, state]) => (
              <li key={label} className={state} aria-current={state === "now" ? "step" : undefined}>
                {label}
              </li>
            ))}
          </ol>
          <div className="grid-2" style={{ marginTop: "var(--dp-space-64)" }}>
            <div className="window">
              <div className="window-bar">
                <span className="dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                GST ASMT-10 · ZD2910260012345
              </div>
              <ul className="thread">
                <li>
                  <span className="ic">
                    <NoticeIcon size={18} />
                  </span>
                  <span>
                    <b>Notice, Form GST ASMT-10</b>
                    <small>Received 24 Oct 2026 · 3 findings, all verified</small>
                  </span>
                  <DueChip state="later" detail="23 Nov" size="sm" />
                </li>
                <li>
                  <span className="ic">
                    <DocumentIcon size={18} />
                  </span>
                  <span>
                    <b>Reconciliation and supplier statements</b>
                    <small>Supporting papers · 4 files</small>
                  </span>
                  <span />
                </li>
                <li>
                  <span className="ic">
                    <CaseIcon size={18} />
                  </span>
                  <span>
                    <b>Draft reply</b>
                    <small>Waiting for partner approval</small>
                  </span>
                  <StatusPill tone="warning" label="Approval" />
                </li>
                <li>
                  <span className="ic">
                    <ReceiptIcon size={18} />
                  </span>
                  <span>
                    <b>Filing acknowledgement</b>
                    <small>Needs the ARN and the uploaded acknowledgement</small>
                  </span>
                  <span />
                </li>
                <li>
                  <span className="ic">
                    <OrderIcon size={18} />
                  </span>
                  <span>
                    <b>Order</b>
                    <small>Appeal and condonation windows computed from it</small>
                  </span>
                  <span />
                </li>
              </ul>
            </div>
            <ul className="checks">
              <li>
                <CheckIcon size={18} />
                <span>
                  <strong>Partner approval that means something.</strong> Only someone allowed to
                  approve replies can approve, and never the person who asked.
                </span>
              </li>
              <li>
                <CheckIcon size={18} />
                <span>
                  <strong>Filing proof.</strong> "Filed on portal" needs the acknowledgement number
                  and the acknowledgement itself, read and outlined like any page. Dueproof never
                  files anything for you.
                </span>
              </li>
              <li>
                <CheckIcon size={18} />
                <span>
                  <strong>Deadlines from orders.</strong> An order produces its own appeal window,
                  with any condonation window shown separately, computed by the date engine with the
                  rule shown.
                </span>
              </li>
              <li>
                <CheckIcon size={18} />
                <span>
                  <strong>Nothing is overwritten.</strong> Corrections sit beside the original, and
                  history is append-only.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* AI */}
      <section className="band band-canvas" aria-labelledby="ai-title">
        <div className="wrap">
          <div className="section-head">
            <p className="overline">AI that proposes, never decides</p>
            <h2 id="ai-title" className="big-quote">
              Rules and the model both propose. <span className="proof-mark">The page proves.</span>{" "}
              A person decides.
            </h2>
            <p className="lede">
              A model reads unusual phrasing, poor scans and long orders far better than rules. So
              it may propose, behind a proof gate: no AI finding becomes a deadline unless its quote
              is found on the page. The model has no tools, can't change data, and never writes a
              date.
            </p>
          </div>
          <div className="modes">
            {MODES.map(([name, body, where]) => (
              <div key={name}>
                <h3 className="h3">{name}</h3>
                <p className="muted small">{body}</p>
                <span className="where">{where}</span>
              </div>
            ))}
          </div>
          <div className="grid-2" style={{ marginTop: "var(--dp-space-64)", alignItems: "center" }}>
            <div className="stack">
              <h3 className="h3">On our plan, a mix of models, routed by code</h3>
              <p className="muted">
                Routing is code, not a model. Each step up has a recorded reason, and each route
                goes live only when its evaluation beats rules alone. With your own key, you pick
                the model for each tier.
              </p>
              <p className="fine">
                Shares are the working estimate for a typical month, to be measured before prices
                are set. Where AI is never used: the statutory calendar, appeal windows, interest
                and penalty figures, case stages and approvals.
              </p>
            </div>
            <ul className="route" aria-label="Model routing on the AI plan">
              {ROUTES.map(([name, share, desc]) => (
                <li key={name}>
                  <b>{name}</b>
                  <span className="bar" aria-hidden="true">
                    <i style={{ width: `${share}%` }} />
                  </span>
                  <span className="share">~{share} %</span>
                  <span className="desc">{desc}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Editions */}
      <section className="band" aria-labelledby="editions-title">
        <div className="wrap">
          <div className="section-head section-head-wide">
            <p className="overline">Two editions</p>
            <h2 id="editions-title" className="h2">
              Run it yourself, or let us run it.
            </h2>
            <p className="lede">
              Everything that decides whether a finding, a date or an amount is correct is free in
              both. The paid parts are about running a larger firm.
            </p>
          </div>
          <div className="grid-2 cards">
            <div className="edition">
              <p className="overline">Self-hosted</p>
              <p className="price">Free</p>
              <p className="muted">
                On your own server with Docker, or on one desktop with no server at all. Collects
                nothing.
              </p>
              <ul className="checks">
                <li>
                  <CheckIcon size={18} />
                  <span>Every feature that reads, proves and tracks notices</span>
                </li>
                <li>
                  <CheckIcon size={18} />
                  <span>AI off by default; your own key or a local model when you want it</span>
                </li>
                <li>
                  <CheckIcon size={18} />
                  <span>Backup, restore and export of all your data</span>
                </li>
                <li>
                  <CheckIcon size={18} />
                  <span>
                    Business licence key for SAML SSO, audit export and white-label reports, checked
                    offline
                  </span>
                </li>
              </ul>
              <div className="actions">
                <Link className="cta cta-primary" href="/docs/install/">
                  Install guide
                </Link>
                <Link className="cta cta-secondary" href="/pricing/">
                  Compare editions
                </Link>
              </div>
            </div>
            <div className="edition featured">
              <p className="overline">Hosted by us</p>
              <p className="price">Plans from Starter to Enterprise</p>
              <p className="muted">
                With AI or without, and your own key on any plan. Database and functions in Mumbai.
              </p>
              <ul className="checks">
                <li>
                  <CheckIcon size={18} />
                  <span>Nothing to install or upgrade</span>
                </li>
                <li>
                  <CheckIcon size={18} />
                  <span>An AI notice allowance on AI plans, counted in notices, not tokens</span>
                </li>
                <li>
                  <CheckIcon size={18} />
                  <span>No product analytics, no session recording, no trackers</span>
                </li>
                <li>
                  <CheckIcon size={18} />
                  <span>Prices are coming soon</span>
                </li>
              </ul>
              <div className="actions">
                <Link className="cta cta-primary" href="/pricing/">
                  See plans
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Security and privacy */}
      <section className="band band-dark" data-theme="dark" aria-labelledby="security-title">
        <div className="wrap">
          <div className="section-head section-head-wide">
            <p className="overline">Security and privacy</p>
            <h2 id="security-title" className="h2">
              Your documents go only where you send them.
            </h2>
            <p className="lede">
              Notices carry tax positions, PAN and GSTIN numbers and amounts in dispute. We say
              plainly where each piece of data lives, including the parts that aren't in India.
            </p>
          </div>
          <div className="fact-grid">
            <div>
              <h3 className="h4">No data collection</h3>
              <p>
                Self-hosted sends us nothing: no telemetry, no crash reports, no licence phone-home.
                The update check is off by default.
              </p>
            </div>
            <div>
              <h3 className="h4">No trackers on hosted</h3>
              <p>
                No product analytics or session recording. We keep security and error logs without
                document text, billing metering and AI usage counts.
              </p>
            </div>
            <div>
              <h3 className="h4">This website</h3>
              <p>No cookies and no analytics. It is a set of static pages.</p>
            </div>
            <div>
              <h3 className="h4">Where hosted data lives</h3>
              <p>
                Database and functions in Mumbai. Files are stored on Cloudflare R2, which does not
                guarantee India-only storage.
              </p>
            </div>
            <div>
              <h3 className="h4">Every exception disclosed</h3>
              <p>
                With AI on, text is processed where that provider runs the model. Each exception is
                listed in Settings.
              </p>
            </div>
            <div>
              <h3 className="h4">Everything in India</h3>
              <p>
                If a firm needs every byte in India today, the self-hosted edition is the answer.
              </p>
            </div>
          </div>
          <p style={{ marginTop: "var(--dp-space-40)" }}>
            <Link className="text-link" href="/security/">
              How Dueproof is secured <ArrowRightIcon size={16} />
            </Link>
          </p>
        </div>
      </section>

      {/* Desktop and phone */}
      <section className="band" aria-labelledby="devices-title">
        <div className="wrap">
          <div className="section-head section-head-wide">
            <p className="overline">Desktop and phone</p>
            <h2 id="devices-title" className="h2">
              At the desk, and in the client's office.
            </h2>
            <p className="lede">
              A desktop app for Windows, macOS and Linux, and the same web app installable on any
              phone, with the camera for posted letters.
            </p>
          </div>
          <div className="devices">
            <div className="device-desktop">
              <div className="window">
                <div className="window-bar">
                  <span className="dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  Dueproof
                </div>
                <div className="mini-app" aria-hidden="true">
                  <div className="mini-side">
                    <span className="on">Today</span>
                    <span>Inbox</span>
                    <span>Notices</span>
                    <span>Deadlines</span>
                    <span>Clients</span>
                    <span>Reports</span>
                  </div>
                  <div className="mini-main">
                    <h4>Today</h4>
                    <p className="muted" style={{ fontSize: "0.8125rem" }}>
                      1 overdue, 3 due this week, 4 to review
                    </p>
                    <div className="mini-card">
                      <div className="reg-row">
                        <span className="t">Reply to DRC-01, Kaveri Textiles</span>
                        <DueChip state="overdue" detail="14 Nov" size="sm" />
                      </div>
                      <div className="reg-row">
                        <span className="t">Hearing, ASMT-10, Harbour Valley</span>
                        <DueChip state="week" detail="18 Nov" size="sm" />
                      </div>
                      <div className="reg-row">
                        <span className="t">GSTR-3B, October, 41 clients</span>
                        <DueChip state="week" detail="20 Nov" size="sm" />
                      </div>
                      <div className="reg-row">
                        <span className="t">Reply to ASMT-10, Harbour Valley</span>
                        <DueChip state="later" detail="23 Nov" size="sm" />
                      </div>
                    </div>
                    <div className="mini-split">
                      <div className="mini-card mini-stat">
                        <small>Needs review</small>
                        <b>4</b>
                        <span className="muted">1 suggested by AI, not yet verified</span>
                      </div>
                      <div className="mini-card mini-stat">
                        <small>Open demand, firm-wide</small>
                        <b>₹1.2 crore</b>
                        <span className="muted">Across 18 clients</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="device-phone" aria-hidden="true">
              <div className="screen">
                <div
                  className="mini-main"
                  style={{ padding: "var(--dp-space-24) var(--dp-space-12)" }}
                >
                  <h4 style={{ fontSize: "1rem" }}>Capture</h4>
                  <div
                    className="mini-card"
                    style={{
                      aspectRatio: "3 / 4",
                      display: "grid",
                      placeItems: "center",
                      color: "var(--dp-fg-tertiary)",
                    }}
                  >
                    <CameraIcon size={28} />
                  </div>
                  <div className="mini-card">
                    <div className="reg-row">
                      <span className="t" style={{ fontSize: "0.6875rem" }}>
                        Uploaded · reading
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="grid-3" style={{ marginTop: "var(--dp-space-48)" }}>
            <div className="card-flat">
              <MonitorIcon size={22} />
              <h3 className="h3" style={{ marginTop: "var(--dp-space-12)" }}>
                Desktop app
              </h3>
              <p className="muted small">
                Connect mode works with a server, yours or ours. Local mode, planned for v0.1, runs
                everything on one machine with no server, for one person, without sync.
              </p>
            </div>
            <div className="card-flat">
              <CameraIcon size={22} />
              <h3 className="h3" style={{ marginTop: "var(--dp-space-12)" }}>
                Phone, as an installable web app
              </h3>
              <p className="muted small">
                Add it to the home screen. Photograph a letter with the camera; it is checked and
                read like any upload. Native phone apps come after v0.1.
              </p>
            </div>
            <div className="card-flat">
              <BellIcon size={22} />
              <h3 className="h3" style={{ marginTop: "var(--dp-space-12)" }}>
                Notifications you opt into
              </h3>
              <p className="muted small">
                Web Push, sent by your own server when self-hosted, says only that a deadline needs
                attention: never a client name, amount or document text.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Closer */}
      <section className="band band-canvas closer" aria-labelledby="cta-title">
        <div className="wrap">
          <p className="overline" style={{ justifyContent: "center" }}>
            Start
          </p>
          <h2 id="cta-title" className="display">
            Stop copying dates into a spreadsheet.
          </h2>
          <p className="lede">
            Self-host the free edition, or follow the hosted plans as they open. {LICENCE.short}
          </p>
          <div className="actions">
            <Link className="cta cta-primary" href="/docs/install/">
              Self-host free
            </Link>
            <Link className="cta cta-secondary" href="/pricing/">
              Hosted plans
            </Link>
            <a className="cta cta-secondary" href={REPO}>
              <ShieldCheckIcon size={18} /> Read the source
            </a>
          </div>
          <p className="fine" style={{ marginTop: "var(--dp-space-24)" }}>
            <VerifiedIcon size={14} style={{ display: "inline", verticalAlign: "-2px" }} />{" "}
            Statutory periods and rates are marked "verify" until a practising CA signs them off.{" "}
            <AiSuggestedIcon size={14} style={{ display: "inline", verticalAlign: "-2px" }} /> AI is
            off until you turn it on.
          </p>
        </div>
      </section>
    </>
  );
}
