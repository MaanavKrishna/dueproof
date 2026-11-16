"use client";

import Link from "next/link";
import { useState } from "react";
import { REPO } from "@/lib/site";
import { AiSuggestedIcon, CheckIcon, MinusIcon } from "./icons";
import { Badge, SegmentedControl } from "./ui";

type Line = { text: string; included?: boolean };
type Plan = {
  name: string;
  for: string;
  featured?: boolean;
  price: string;
  unit?: string;
  ai: { with: Line[]; without: Line[] };
  lines: Line[];
  cta: { label: string; href: string };
};

const PLANS: Plan[] = [
  {
    name: "Starter",
    for: "Solo practitioners.",
    price: "Coming soon",
    ai: {
      with: [
        { text: "AI with your own key" },
        { text: "No Dueproof AI allowance on this plan", included: false },
      ],
      without: [{ text: "Rules read every notice" }, { text: "Add your own key at any time" }],
    },
    lines: [
      { text: "Every feature that reads, proves and tracks notices" },
      { text: "Case threads, statutory calendar, exposure" },
      { text: "Email support, first reply in 2 working days" },
    ],
    cta: { label: "Prices coming soon", href: "#how-prices" },
  },
  {
    name: "Pro",
    for: "Small firms, priced per seat.",
    featured: true,
    price: "Coming soon",
    unit: "per seat",
    ai: {
      with: [
        { text: "A monthly AI notice allowance, on the model mix" },
        { text: "At the cap, AI stops and the rules carry on" },
      ],
      without: [{ text: "Rules read every notice" }, { text: "Your own key is always allowed" }],
    },
    lines: [
      { text: "Everything in Starter" },
      { text: "Roles, client-level access, partner approval" },
      { text: "Email support, first reply in 2 working days" },
    ],
    cta: { label: "Prices coming soon", href: "#how-prices" },
  },
  {
    name: "Firm",
    for: "Firms of 10 to 100 people.",
    price: "Coming soon",
    ai: {
      with: [
        { text: "AI notice allowance included" },
        { text: "Bring your own key to lower the price" },
      ],
      without: [
        { text: "With your own key instead, at a lower price" },
        { text: "Rules alone, if you prefer" },
      ],
    },
    lines: [
      { text: "Everything in Pro" },
      { text: "Signed audit export" },
      { text: "White-label reports with your logo only" },
      { text: "A named contact, first reply in 1 working day" },
    ],
    cta: { label: "Prices coming soon", href: "#how-prices" },
  },
  {
    name: "Enterprise",
    for: "Lenders and large firms.",
    price: "By conversation",
    ai: {
      with: [
        { text: "AI on terms you set, or your own key" },
        { text: "Redaction of PAN, Aadhaar and bank numbers before AI" },
      ],
      without: [{ text: "Rules alone, or your own key" }, { text: "Restrict AI per client" }],
    },
    lines: [
      { text: "Everything in Firm" },
      { text: "SAML single sign-on" },
      { text: "Data processing agreement and VAPT report" },
      { text: "Multiple organisations and branches" },
    ],
    cta: { label: "Talk to us", href: `${REPO}/discussions` },
  },
];

export function HostedPlans() {
  const [ai, setAi] = useState<"with" | "without">("with");
  return (
    <div>
      <div className="toggle-row">
        <SegmentedControl
          aria-label="Show plans"
          value={ai}
          onValueChange={(v) => setAi(v as "with" | "without")}
          segments={[
            { value: "with", label: "With AI" },
            { value: "without", label: "Without AI" },
          ]}
        />
        <p className="fine">
          Planned for after the beta. Prices are set once the AI cost is measured, and no plan is
          sold before then.
        </p>
      </div>
      <div className="plans">
        {PLANS.map((p) => (
          <article
            key={p.name}
            className={`plan${p.featured ? " featured" : ""}`}
            aria-labelledby={`plan-${p.name}`}
          >
            <div className="plan-head">
              <h3 id={`plan-${p.name}`} className="h3">
                {p.name}
              </h3>
              {p.featured && (
                <Badge tone="accent" size="sm">
                  Most firms
                </Badge>
              )}
            </div>
            <p className="for">{p.for}</p>
            <p className="price">
              {p.price}
              {p.unit && <small>{p.unit}</small>}
            </p>
            <ul className="checks" aria-live="polite">
              {p.ai[ai].map((l) => (
                <li key={l.text} className={l.included === false ? "no" : undefined}>
                  {l.included === false ? <MinusIcon size={18} /> : <AiSuggestedIcon size={18} />}
                  <span>{l.text}</span>
                </li>
              ))}
              {p.lines.map((l) => (
                <li key={l.text}>
                  <CheckIcon size={18} />
                  <span>{l.text}</span>
                </li>
              ))}
            </ul>
            <div className="actions">
              {p.cta.href.startsWith("#") ? (
                <a
                  className={`cta ${p.featured ? "cta-primary" : "cta-secondary"}`}
                  href={p.cta.href}
                >
                  {p.cta.label}
                </a>
              ) : (
                <Link
                  className={`cta ${p.featured ? "cta-primary" : "cta-secondary"}`}
                  href={p.cta.href}
                >
                  {p.cta.label}
                </Link>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
