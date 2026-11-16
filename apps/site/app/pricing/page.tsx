import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { AiSuggestedIcon, CheckIcon, MinusIcon } from "@/components/icons";
import { PageHero } from "@/components/PageHero";
import { HostedPlans } from "@/components/PricingPlans";
import { LICENCE, REPO } from "@/lib/site";

export const metadata: Metadata = { title: "Pricing" };

type Cell = boolean | string;
const COMPARE: { group: string; rows: [string, Cell, Cell, Cell][] }[] = [
  {
    group: "The product",
    rows: [
      ["Read, prove and track notices", true, true, true],
      ["Case threads, approval, filing proof, deadlines from orders", true, true, true],
      ["Statutory calendar, demand exposure, interest calculator", true, true, true],
      ["Clients, roles, review queue, search, reports", true, true, true],
      ["English and 22 Indian languages, offline translation", true, true, true],
      ["Backup, restore and export of all your data", true, true, true],
      ["Desktop app", "Local and Connect", "Local and Connect", "Connect"],
      ["Phone: installable web app with camera capture", true, true, true],
      ["Sign in with Google or Microsoft", true, true, true],
    ],
  },
  {
    group: "AI",
    rows: [
      ["AI with your own key", true, true, "Any plan"],
      ["AI with a local model", true, true, false],
      ["Dueproof AI plan (notice allowance)", false, false, "AI plans"],
    ],
  },
  {
    group: "For larger firms",
    rows: [
      ["SAML single sign-on", false, true, "Enterprise"],
      ["Signed audit export, custom retention", false, true, "Firm, Enterprise"],
      ["White-label reports", false, true, "Firm, Enterprise"],
      ["Support", "Community", "Email, 2 working days", "By plan"],
    ],
  },
];

function Mark({ v }: { v: Cell }) {
  if (v === true)
    return (
      <span className="yes">
        <CheckIcon size={18} label="Included" />
      </span>
    );
  if (v === false)
    return (
      <span className="no">
        <MinusIcon size={18} label="Not included" />
      </span>
    );
  return <>{v}</>;
}

export default function Pricing() {
  return (
    <>
      <PageHero overline="Pricing" title="Free to self-host. Hosted plans, with AI or without.">
        <p>
          Anything that decides whether a finding, a date or an amount is correct or provable is
          free in every edition. You pay for us running it, for AI on our account, or for features a
          larger firm needs.
        </p>
      </PageHero>

      <section className="band band-canvas" aria-labelledby="self-title">
        <div className="wrap">
          <div className="section-head section-head-wide">
            <p className="overline">Self-hosted</p>
            <h2 id="self-title" className="h2">
              On your server. Collects nothing.
            </h2>
            <p className="muted">
              Docker Compose with Postgres on your own server, or the desktop app on one machine.
              Business features unlock with a signed licence file checked offline: no activation
              server, no call home.
            </p>
          </div>
          <div className="plans plans-2">
            <article className="plan" aria-labelledby="plan-free">
              <h3 id="plan-free" className="h3">
                Free
              </h3>
              <p className="for">For any firm, of any size, forever.</p>
              <p className="price">₹0</p>
              <ul className="checks">
                <li>
                  <CheckIcon size={18} />
                  <span>
                    The whole product: reading, proof, deadlines, cases, calendar, exposure
                  </span>
                </li>
                <li>
                  <AiSuggestedIcon size={18} />
                  <span>AI off by default; your own key or a local model when you want it</span>
                </li>
                <li>
                  <CheckIcon size={18} />
                  <span>All 23 languages, translated offline</span>
                </li>
                <li>
                  <CheckIcon size={18} />
                  <span>Community support on GitHub</span>
                </li>
              </ul>
              <div className="actions">
                <Link className="cta cta-primary" href="/docs/install/">
                  Install guide
                </Link>
              </div>
            </article>
            <article className="plan" aria-labelledby="plan-business">
              <h3 id="plan-business" className="h3">
                Business
              </h3>
              <p className="for">An annual licence key per organisation.</p>
              <p className="price">Coming soon</p>
              <ul className="checks">
                <li>
                  <CheckIcon size={18} />
                  <span>Everything in Free</span>
                </li>
                <li>
                  <CheckIcon size={18} />
                  <span>SAML single sign-on</span>
                </li>
                <li>
                  <CheckIcon size={18} />
                  <span>Signed audit export and custom retention</span>
                </li>
                <li>
                  <CheckIcon size={18} />
                  <span>White-label reports: your logo only, no Dueproof mark</span>
                </li>
                <li>
                  <CheckIcon size={18} />
                  <span>Email support, first reply within 2 working days (IST)</span>
                </li>
              </ul>
              <div className="actions">
                <a className="cta cta-secondary" href="#licence-key">
                  How the licence key works
                </a>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="band" aria-labelledby="hosted-title">
        <div className="wrap">
          <div className="section-head section-head-wide">
            <p className="overline">Hosted by us</p>
            <h2 id="hosted-title" className="h2">
              Nothing to install. AI if you want it.
            </h2>
            <p className="muted">
              A 14-day trial with a sample workspace of fictional notices. Billing through Razorpay
              in India, in rupees, with UPI and GST invoices.
            </p>
          </div>
          <HostedPlans />
          <div className="byok">
            <AiSuggestedIcon size={22} />
            <p>
              <strong>Bring your own key on any plan.</strong> Use your own Anthropic, OpenAI,
              Google, Azure OpenAI or AWS Bedrock account; text goes to that provider and is billed
              to you, and you choose the model for each tier.
            </p>
          </div>
        </div>
      </section>

      <section className="band band-canvas" aria-labelledby="compare-title">
        <div className="wrap">
          <div className="section-head">
            <p className="overline">Compare</p>
            <h2 id="compare-title" className="h2">
              Side by side.
            </h2>
          </div>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  <th scope="col" className="c">
                    Self-hosted Free
                  </th>
                  <th scope="col" className="c">
                    Self-hosted Business
                  </th>
                  <th scope="col" className="c">
                    Hosted
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((g) => (
                  <Fragment key={g.group}>
                    <tr className="group">
                      <th scope="colgroup" colSpan={4}>
                        {g.group}
                      </th>
                    </tr>
                    {g.rows.map(([label, a, b, c]) => (
                      <tr key={label}>
                        <th scope="row">{label}</th>
                        <td className="c">
                          <Mark v={a} />
                        </td>
                        <td className="c">
                          <Mark v={b} />
                        </td>
                        <td className="c">
                          <Mark v={c} />
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="fine" style={{ marginTop: "var(--dp-space-16)" }}>
            Later, under the same licence key: SCIM provisioning, SIEM streaming, high availability
            and multiple organisations in one install.
          </p>
        </div>
      </section>

      <section className="band" aria-labelledby="faq-title">
        <div className="wrap">
          <div className="section-head">
            <p className="overline">Good to know</p>
            <h2 id="faq-title" className="h2">
              The fine print, in plain words.
            </h2>
          </div>
          <ul className="rule-list">
            <li id="how-prices">
              <span>Why no prices yet?</span>
              <span className="muted">
                AI plans run a mix of models, and we want to measure what that costs on real notices
                before we promise a price. Prices for every plan, and for the Business licence, are
                published together.
              </span>
            </li>
            <li>
              <span>What happens at the AI cap?</span>
              <span className="muted">
                The allowance is counted in notices, not tokens, so you can predict it. At the cap,
                AI stops and the rules carry on reading. Nothing is lost.
              </span>
            </li>
            <li id="licence-key">
              <span>How the Business licence key works</span>
              <span className="muted">
                A small file signed with Ed25519, pasted into Settings. It is checked offline at
                start and once a day. No licence state can ever block reading, proof, deadlines,
                export or backup. After expiry there are 30 days of grace, then Business features
                switch off cleanly and no data is lost. A 30-day trial key is available on request.
              </span>
            </li>
            <li>
              <span>If a payment fails</span>
              <span className="muted">
                14 days of grace with a banner, then read-only with export still open. Downgrades
                take effect at the end of the paid period, and a downgrade never deletes anything.
              </span>
            </li>
            <li>
              <span>Payments outside India</span>
              <span className="muted">
                Razorpay first. Stripe, in local currencies, follows once an account for an Indian
                business is confirmed. <span className="verify">verify</span>
              </span>
            </li>
            <li>
              <span>The licence</span>
              <span className="muted">
                {LICENCE.long} You may run it for your own firm. What it forbids is offering it as a
                competing commercial product or service. The wording is being reviewed by a lawyer
                before launch. <a href={`${REPO}/blob/main/LICENSE`}>Read the licence</a>.
              </span>
            </li>
          </ul>
        </div>
      </section>
    </>
  );
}
