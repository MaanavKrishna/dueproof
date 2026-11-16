/**
 * Account emails: an invitation to join an organisation, and a password
 * reset link. Plain HTML (inline styles, as mail clients need) with a text
 * part. Pure; the links in them are secrets and are never logged.
 */
import { resolveColor } from "@dueproof/tokens";
import type { MailMessage } from "./mail";

const C = {
  fg: resolveColor("fg.primary"),
  muted: resolveColor("fg.secondary"),
  accent: resolveColor("accent.solid"),
  onAccent: resolveColor("fg.inverse"),
};

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

function article(role: string): string {
  return /^[aeiou]/i.test(role) ? "an" : "a";
}

function layout(paragraphs: string[], button: { label: string; href: string }, after: string[]) {
  const p = (s: string) =>
    `<p style="margin:0 0 16px;font:15px/1.5 system-ui,sans-serif;color:${C.fg}">${esc(s)}</p>`;
  const small = (s: string) =>
    `<p style="margin:0 0 12px;font:13px/1.5 system-ui,sans-serif;color:${C.muted}">${esc(s)}</p>`;
  return [
    `<div style="max-width:560px;margin:0 auto;padding:24px">`,
    ...paragraphs.map(p),
    `<p style="margin:24px 0"><a href="${esc(button.href)}" style="display:inline-block;padding:10px 18px;border-radius:6px;background:${C.accent};color:${C.onAccent};font:600 15px system-ui,sans-serif;text-decoration:none">${esc(button.label)}</a></p>`,
    small("If the button doesn't work, copy this link into your browser:"),
    `<p style="margin:0 0 16px;font:13px/1.5 ui-monospace,monospace;word-break:break-all;color:${C.muted}">${esc(button.href)}</p>`,
    ...after.map(small),
    `</div>`,
  ].join("");
}

export interface InviteEmailInput {
  to: string;
  orgName: string;
  inviterName: string | null;
  role: string;
  link: string;
  days: number;
}

export function renderInviteEmail(input: InviteEmailInput): MailMessage {
  const lead = input.inviterName
    ? `${input.inviterName} has invited you to join ${input.orgName} on Dueproof as ${article(input.role)} ${input.role}.`
    : `You've been invited to join ${input.orgName} on Dueproof as ${article(input.role)} ${input.role}.`;
  const steps = "Open the link, choose your name and a password, and you're in.";
  const expiry = `The invitation lasts ${input.days} days. If you weren't expecting it, you can ignore this email.`;
  return {
    to: input.to,
    subject: `Join ${input.orgName} on Dueproof`,
    html: layout([lead, steps], { label: "Accept the invitation", href: input.link }, [expiry]),
    text: [lead, "", steps, "", input.link, "", expiry].join("\n"),
  };
}

export interface ResetEmailInput {
  to: string;
  name: string | null;
  link: string;
}

export function renderResetEmail(input: ResetEmailInput): MailMessage {
  const hello = input.name ? `Hello ${input.name},` : "Hello,";
  const lead =
    "You, or an administrator of your organisation, asked for a link to choose a new Dueproof password.";
  const expiry =
    "The link works once, for one hour. If you didn't ask for it, ignore this email: your password stays the same.";
  return {
    to: input.to,
    subject: "Reset your Dueproof password",
    html: layout([hello, lead], { label: "Choose a new password", href: input.link }, [expiry]),
    text: [hello, "", lead, "", input.link, "", expiry].join("\n"),
  };
}
