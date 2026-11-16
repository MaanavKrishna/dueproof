"use client";
import type { ReactNode } from "react";
import styles from "./AuthCard.module.css";

export { styles as authStyles };

/** The centred card the sign-in, sign-up and reset screens share. */
export function AuthCard({
  title,
  lede,
  children,
  foot,
}: {
  title: ReactNode;
  lede?: ReactNode;
  children: ReactNode;
  foot?: ReactNode;
}) {
  return (
    <main className={styles.page} id="dp-main">
      <div className={styles.column}>
        <div className={styles.brand}>
          <span aria-hidden="true" className={styles.mark} />
          Dueproof
        </div>
        <section className={styles.card} aria-labelledby="auth-title">
          <header className={styles.head}>
            <h1 id="auth-title" className={styles.title} tabIndex={-1}>
              {title}
            </h1>
            {lede ? <p className={styles.lede}>{lede}</p> : null}
          </header>
          {children}
        </section>
        {foot ? <p className={styles.foot}>{foot}</p> : null}
      </div>
    </main>
  );
}

/** Better Auth's error → a plain sentence (never echoes input). */
export function authMessage(
  error:
    | { status?: number | undefined; code?: string | undefined; message?: string | undefined }
    | null
    | undefined,
  fallback = "Something went wrong. Try again.",
): string {
  if (!error) return fallback;
  if (error.status === 429) return "Too many attempts. Wait a few minutes and try again.";
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "That email and password don't match. Check them and try again.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "There's already an account with this email. Sign in instead.";
    case "PASSWORD_TOO_SHORT":
      return "Use at least 10 characters for your password.";
    case "INVALID_CODE":
    case "INVALID_TWO_FACTOR_AUTHENTICATION":
      return "That code didn't work. Codes change every 30 seconds; try the current one.";
    case "INVALID_BACKUP_CODE":
      return "That backup code didn't work.";
    case "INVALID_TOKEN":
      return "This reset link has expired. Ask for a new one.";
  }
  if (error.status === 403 && error.message) return error.message;
  if (error.status === 401) return "That didn't work. Check what you entered and try again.";
  return fallback;
}
