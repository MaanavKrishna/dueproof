"use client";
/**
 * Password reset. Without a token: ask for a link (the answer never says
 * whether an account exists). With one (from the emailed link): choose a
 * new password.
 *
 * TODO(email): Better Auth needs `emailAndPassword.sendResetPassword` in
 * packages/auth before links are actually sent. Until then the request
 * succeeds quietly and the page says an administrator can help.
 */
import { authClient } from "@dueproof/auth/client";
import { Banner, Button, Link, TextField } from "@dueproof/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { AuthCard, authMessage, authStyles as styles } from "./AuthCard";

export function ResetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter the email address you sign in with.");
      return;
    }
    setBusy(true);
    const res = await authClient.requestPasswordReset({
      email: email.trim(),
      redirectTo: "/reset-password",
    });
    setBusy(false);
    // Rate limits are worth saying; anything else would reveal whether the account exists.
    if (res.error?.status === 429) {
      setError(authMessage(res.error));
      return;
    }
    setSent(true);
  };

  const reset = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 10) {
      setError("Use at least 10 characters.");
      return;
    }
    if (!token) return;
    setBusy(true);
    const res = await authClient.resetPassword({ newPassword: password, token });
    setBusy(false);
    if (res.error) {
      setError(authMessage(res.error));
      return;
    }
    router.replace("/sign-in");
  };

  const foot = (
    <>
      Remembered it? <Link href="/sign-in">Sign in</Link>
    </>
  );

  if (token) {
    return (
      <AuthCard title="Choose a new password" foot={foot}>
        <form className={styles.form} onSubmit={reset} noValidate>
          {error ? (
            <Banner tone="danger" role="alert">
              {error}
            </Banner>
          ) : null}
          <TextField
            label="New password"
            type="password"
            autoComplete="new-password"
            description="At least 10 characters."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>
            Save password
          </Button>
        </form>
      </AuthCard>
    );
  }

  if (sent) {
    return (
      <AuthCard
        title="Check your email"
        lede={`If ${email.trim()} has an account, a reset link is on its way. It works for one hour.`}
        foot={foot}
      >
        <Banner tone="info" title="No email?">
          Installs without an email server can't send links yet. Ask an administrator of your firm
          for help.
        </Banner>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      lede="Enter your email and we'll send you a link to choose a new password."
      foot={foot}
    >
      <form className={styles.form} onSubmit={request} noValidate>
        {error ? (
          <Banner tone="danger" role="alert">
            {error}
          </Banner>
        ) : null}
        <TextField
          label="Work email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>
          Send reset link
        </Button>
      </form>
    </AuthCard>
  );
}
