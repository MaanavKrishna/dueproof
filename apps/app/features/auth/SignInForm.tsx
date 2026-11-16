"use client";
/**
 * Sign in: email and password, or a passkey; then the TOTP step when the
 * account has two-step verification (or a backup code instead). With single
 * sign-on set up (Business), "Continue with SSO" sends the browser to the
 * identity provider for the email's domain.
 */
import { authClient } from "@dueproof/auth/client";
import { ExternalLinkIcon, LockIcon } from "@dueproof/icons";
import { Banner, Button, Checkbox, Link, TextField } from "@dueproof/ui";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { AuthCard, authMessage, authStyles as styles } from "./AuthCard";

type Step = "password" | "totp" | "backup";

export function SignInForm({
  next,
  firstRun,
  sso = false,
  ssoError = false,
}: {
  next: string;
  firstRun: boolean;
  /** Single sign-on is set up on this server (and licensed). */
  sso?: boolean;
  /** Came back from the identity provider with an error. */
  ssoError?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [trust, setTrust] = useState(false);
  const [busy, setBusy] = useState<"password" | "passkey" | "code" | "sso" | null>(null);
  const [error, setError] = useState<string | null>(
    ssoError
      ? "Single sign-on didn't work. If you already have a Dueproof password, sign in with it."
      : null,
  );
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step !== "password") codeRef.current?.focus();
  }, [step]);

  const done = () => {
    router.replace(next);
    router.refresh();
  };

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy("password");
    const res = await authClient.signIn.email({ email: email.trim(), password });
    setBusy(null);
    if (res.error) {
      setError(authMessage(res.error));
      return;
    }
    if ((res.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
      setStep("totp");
      return;
    }
    done();
  };

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const value = code.replace(/\s+/g, "");
    if (!value) {
      setError(step === "totp" ? "Enter the 6-digit code." : "Enter a backup code.");
      return;
    }
    setBusy("code");
    const res =
      step === "totp"
        ? await authClient.twoFactor.verifyTotp({ code: value, trustDevice: trust })
        : await authClient.twoFactor.verifyBackupCode({ code: value, trustDevice: trust });
    setBusy(null);
    if (res.error) {
      setError(authMessage(res.error));
      return;
    }
    done();
  };

  const continueWithSso = async () => {
    setError(null);
    if (!email.trim()) {
      setError("Enter your work email, then continue with SSO.");
      return;
    }
    setBusy("sso");
    try {
      const res = await fetch("/api/auth/sign-in/sso", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          callbackURL: next,
          errorCallbackURL: "/sign-in?sso=failed",
        }),
      });
      const body = (await res.json().catch(() => null)) as { url?: string } | null;
      if (!res.ok || !body?.url) {
        setBusy(null);
        setError("There's no single sign-on for that email. Use your password.");
        return;
      }
      window.location.href = body.url;
    } catch {
      setBusy(null);
      setError("Couldn't reach the server. Check your connection.");
    }
  };

  const passkey = async () => {
    setError(null);
    setBusy("passkey");
    const res = await authClient.signIn.passkey();
    setBusy(null);
    if (res?.error) {
      // Cancelling the browser's prompt isn't an error worth shouting about.
      if ((res.error as { code?: string }).code !== "AUTH_CANCELLED")
        setError("That passkey didn't work. Try again, or use your password.");
      return;
    }
    done();
  };

  if (step !== "password") {
    return (
      <AuthCard
        title="Two-step verification"
        lede={
          step === "totp"
            ? "Enter the 6-digit code from your authenticator app."
            : "Enter one of the backup codes you saved when you turned this on."
        }
      >
        <form className={styles.form} onSubmit={submitCode} noValidate>
          {error ? (
            <Banner tone="danger" role="alert">
              {error}
            </Banner>
          ) : null}
          <TextField
            ref={codeRef}
            label={step === "totp" ? "Code" : "Backup code"}
            inputMode={step === "totp" ? "numeric" : "text"}
            autoComplete="one-time-code"
            className={styles.code}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={step === "totp" ? 8 : 32}
          />
          <Checkbox
            label="Trust this device for 30 days"
            checked={trust}
            onCheckedChange={(v) => setTrust(v === true)}
          />
          <Button type="submit" variant="primary" size="lg" fullWidth loading={busy === "code"}>
            Verify
          </Button>
          <div className={styles.row}>
            <Button
              variant="plain"
              size="sm"
              onClick={() => {
                setCode("");
                setError(null);
                setStep(step === "totp" ? "backup" : "totp");
              }}
            >
              {step === "totp" ? "Use a backup code" : "Use the authenticator app"}
            </Button>
            <Button
              variant="plain"
              size="sm"
              onClick={() => {
                setStep("password");
                setCode("");
                setError(null);
              }}
            >
              Start again
            </Button>
          </div>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Sign in"
      lede="Every deadline in your notices, proved on the page."
      foot={
        firstRun ? (
          <>
            New install? <Link href="/sign-up">Set up Dueproof</Link>
          </>
        ) : (
          <>Don't have an account? Ask an administrator of your firm to invite you.</>
        )
      }
    >
      <form className={styles.form} onSubmit={submitPassword} noValidate>
        {error ? (
          <Banner tone="danger" role="alert">
            {error}
          </Banner>
        ) : null}
        <TextField
          label="Work email"
          type="email"
          autoComplete="username webauthn"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className={styles.row}>
          <span />
          <NextLink href="/reset-password" className={styles.foot}>
            Forgot your password?
          </NextLink>
        </div>
        <Button type="submit" variant="primary" size="lg" fullWidth loading={busy === "password"}>
          Sign in
        </Button>
      </form>
      <div className={styles.divider}>or</div>
      <Button
        variant="secondary"
        size="lg"
        fullWidth
        icon={LockIcon}
        loading={busy === "passkey"}
        onClick={passkey}
      >
        Sign in with a passkey
      </Button>
      {sso ? (
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          icon={ExternalLinkIcon}
          loading={busy === "sso"}
          onClick={continueWithSso}
        >
          Continue with SSO
        </Button>
      ) : null}
    </AuthCard>
  );
}
