/**
 * The morning digest (01 §4): for one person, what is overdue, due today and
 * due this week, and what awaits their approval. Rendered as a plain HTML
 * email (inline styles, as mail clients need) and a text part. Pure.
 */
import { resolveColor } from "@dueproof/tokens";
import type { DeadlineRow } from "@/lib/deadline-rows";

/** Mail clients need inline colours: resolved from the design tokens (light mode). */
const C = {
  canvas: resolveColor("bg.canvas"),
  surface: resolveColor("bg.surface"),
  fg: resolveColor("fg.primary"),
  muted: resolveColor("fg.secondary"),
  accent: resolveColor("accent.solid"),
  onAccent: resolveColor("fg.inverse"),
};

export interface DigestInput {
  orgName: string;
  personName: string;
  today: string;
  appUrl: string;
  overdue: DeadlineRow[];
  dueToday: DeadlineRow[];
  thisWeek: DeadlineRow[];
  awaitingApproval: { id: string; title: string; clientName: string | null }[];
}

export interface RenderedDigest {
  subject: string;
  html: string;
  text: string;
  /** Nothing to say: don't send. */
  empty: boolean;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const d = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

function line(r: DeadlineRow): string {
  return `${r.title}${r.clientName ? ` · ${r.clientName}` : ""} (due ${d(r.dueOn)})`;
}

export function renderDigest(input: DigestInput): RenderedDigest {
  const sections: [string, string[]][] = [
    ["Overdue", input.overdue.map(line)],
    ["Due today", input.dueToday.map(line)],
    ["This week", input.thisWeek.map(line)],
    [
      "Awaiting your approval",
      input.awaitingApproval.map((a) => `${a.title}${a.clientName ? ` · ${a.clientName}` : ""}`),
    ],
  ];
  const shown = sections.filter(([, items]) => items.length);
  const counts = [
    input.overdue.length ? `${input.overdue.length} overdue` : null,
    input.dueToday.length ? `${input.dueToday.length} due today` : null,
    input.thisWeek.length ? `${input.thisWeek.length} this week` : null,
    input.awaitingApproval.length ? `${input.awaitingApproval.length} to approve` : null,
  ].filter(Boolean);
  const subject = counts.length
    ? `Dueproof · ${d(input.today)}: ${counts.join(", ")}`
    : `Dueproof · ${d(input.today)}: nothing due`;
  const link = new URL("/today", input.appUrl).toString();
  const html = `<!doctype html><html lang="en"><body style="margin:0;padding:24px;background:${C.canvas};font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:${C.fg}">
<div style="max-width:560px;margin:0 auto;background:${C.surface};border-radius:8px;padding:24px">
<p style="margin:0 0 4px;color:${C.muted};font-size:13px">${esc(input.orgName)} · ${esc(d(input.today))}</p>
<h1 style="margin:0 0 16px;font-size:20px">Good morning, ${esc(input.personName.split(" ")[0] ?? input.personName)}</h1>
${shown
  .map(
    ([
      title,
      items,
    ]) => `<h2 style="margin:16px 0 6px;font-size:15px">${esc(title)} (${items.length})</h2>
<ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.5">${items
      .slice(0, 15)
      .map((i) => `<li>${esc(i)}</li>`)
      .join("")}${items.length > 15 ? `<li>and ${items.length - 15} more</li>` : ""}</ul>`,
  )
  .join("\n")}
<p style="margin:24px 0 0"><a href="${esc(link)}" style="background:${C.accent};color:${C.onAccent};padding:10px 16px;border-radius:6px;text-decoration:none;font-size:14px">Open Today</a></p>
<p style="margin:24px 0 0;color:${C.muted};font-size:12px">Dates show the rule that produced them in the app. You get this because you're a member of ${esc(input.orgName)}.</p>
</div></body></html>`;
  const text = [
    `${input.orgName} · ${d(input.today)}`,
    "",
    ...shown.flatMap(([title, items]) => [
      `${title} (${items.length})`,
      ...items.slice(0, 15).map((i) => `- ${i}`),
      "",
    ]),
    `Open Today: ${link}`,
  ].join("\n");
  return { subject, html, text, empty: shown.length === 0 };
}
