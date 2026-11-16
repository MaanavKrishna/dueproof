/**
 * Mail port: SMTP for self-hosted, Resend for hosted, and a stub that only
 * records what would have been sent when neither is configured (dev, tests,
 * a fresh install). Never logs message bodies (AGENTS rule 5).
 */
import "server-only";
import type { Env } from "./env";

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface MailResult {
  driver: "smtp" | "resend" | "log";
  delivered: boolean;
  id?: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<MailResult>;
}

/** Messages the stub "sent", newest last; for tests and the dev harness. */
export const stubOutbox: MailMessage[] = [];

/** The container's mailer when a test installed one, else the one the environment configures. */
export function mailerFor(c: { env: Env; mailer?: Mailer | undefined }): Mailer {
  return c.mailer ?? createMailer(c.env);
}

/** Whether mail actually leaves this install (the log driver only records it). */
export function canSendMail(c: { env: Env; mailer?: Mailer | undefined }): boolean {
  return Boolean(c.mailer) || c.env.MAIL_DRIVER !== "log";
}

export function createMailer(env: Env): Mailer {
  switch (env.MAIL_DRIVER) {
    case "resend":
      return {
        async send(m) {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              authorization: `Bearer ${env.RESEND_API_KEY}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              from: env.MAIL_FROM,
              to: [m.to],
              subject: m.subject,
              html: m.html,
              text: m.text,
            }),
          });
          if (!res.ok) throw new Error(`Resend refused the message (${res.status})`);
          const json = (await res.json().catch(() => ({}))) as { id?: string };
          return { driver: "resend", delivered: true, ...(json.id ? { id: json.id } : {}) };
        },
      };
    case "smtp":
      return {
        async send(m) {
          const nodemailer = (await import("nodemailer")).default;
          const transport = nodemailer.createTransport(env.SMTP_URL as string);
          const info = await transport.sendMail({
            from: env.MAIL_FROM,
            to: m.to,
            subject: m.subject,
            html: m.html,
            text: m.text,
          });
          return { driver: "smtp", delivered: true, id: String(info.messageId ?? "") };
        },
      };
    default:
      return {
        async send(m) {
          stubOutbox.push(m);
          if (stubOutbox.length > 200) stubOutbox.shift();
          return { driver: "log", delivered: false };
        },
      };
  }
}
