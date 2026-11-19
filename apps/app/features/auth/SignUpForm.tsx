"use client";
/**
 * Sign up. The cases from the server: the first person on a new install
 * (creates the organisation as owner, then the setup wizard), someone with
 * an invitation link (joins with the invited role; the link's token goes
 * with the sign-up, H1), open sign-up (hosted), sign-up by invitation only,
 * or an invitation link that no longer works.
 */
import { authClient } from "@dueproof/auth/client";
import { Banner, Button, Link, TextField } from "@dueproof/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { AuthCard, authMessage, authStyles as styles } from "./AuthCard";

export type SignUpMode =
  | { kind: "first" }
  | { kind: "invite"; email: string; orgName: string; role: string; token: string }
  | { kind: "open" }
  | { kind: "closed" }
  | { kind: "expired" };

const MIN_PASSWORD = 10;

export function SignUpForm({ mode }: { mode: SignUpMode }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(mode.kind === "invite" ? mode.email : "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  if (mode.kind === "expired") {
    return (
      <AuthCard
        title="This invitation link doesn't work"
        lede="It has expired, was cancelled or was already used. Ask an administrator of your firm to send you a new one."
        foot={
          <>
            Already have an account? <Link href="/sign-in">Sign in</Link>
          </>
        }
      >
        <Button variant="secondary" fullWidth onClick={() => router.push("/sign-in")}>
          Back to sign in
        </Button>
      </AuthCard>
    );
  }

  if (mode.kind === "closed") {
    return (
      <AuthCard
        title="Sign-up is by invitation"
        lede="To join, ask an administrator of your firm for an invitation link. It opens this page with your email filled in."
        foot={
          <>
            Already have an account? <Link href="/sign-in">Sign in</Link>
          </>
        }
      >
        <Button variant="secondary" fullWidth onClick={() => router.push("/sign-in")}>
          Back to sign in
        </Button>
      </AuthCard>
    );
  }

  const nameError = touched && !name.trim() ? "Enter your name." : undefined;
  const emailError =
    touched && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      ? "Enter a valid email address."
      : undefined;
  const passwordError =
    touched && password.length < MIN_PASSWORD
      ? `Use at least ${MIN_PASSWORD} characters.`
      : undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (!name.trim() || password.length < MIN_PASSWORD || !email.includes("@")) return;
    setBusy(true);
    // The invitation link's token goes with the sign-up (H1); Better Auth
    // passes unknown body fields through to the server's sign-up checks.
    const body = {
      name: name.trim(),
      email: email.trim(),
      password,
      ...(mode.kind === "invite" ? { inviteToken: mode.token } : {}),
    };
    const res = await authClient.signUp.email(body);
    if (res.error) {
      setBusy(false);
      setError(authMessage(res.error));
      return;
    }
    router.replace(mode.kind === "first" ? "/welcome" : "/today");
    router.refresh();
  };

  const copy =
    mode.kind === "first"
      ? {
          title: "Create the admin account",
          lede: "You're the first person on this install. You'll manage the firm's settings, people and backups.",
          button: "Create account and continue",
        }
      : mode.kind === "invite"
        ? {
            title: `Join ${mode.orgName}`,
            lede: `You've been invited as ${mode.role === "admin" || mode.role === "owner" ? "an" : "a"} ${mode.role}. Choose your name and a password.`,
            button: "Create account",
          }
        : {
            title: "Create your account",
            lede: "Free while Dueproof is in beta. Your organisation is created with you as its owner.",
            button: "Create account",
          };

  return (
    <AuthCard
      title={copy.title}
      lede={copy.lede}
      foot={
        <>
          Already have an account? <Link href="/sign-in">Sign in</Link>
        </>
      }
    >
      <form className={styles.form} onSubmit={submit} noValidate>
        {error ? (
          <Banner tone="danger" role="alert">
            {error}
          </Banner>
        ) : null}
        <TextField
          label="Full name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={nameError}
        />
        <TextField
          label="Work email"
          type="email"
          autoComplete="email"
          value={email}
          readOnly={mode.kind === "invite"}
          description={
            mode.kind === "invite" ? "The address your invitation was sent to." : undefined
          }
          onChange={(e) => setEmail(e.target.value)}
          error={emailError}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          description={`At least ${MIN_PASSWORD} characters. You can add a passkey later.`}
          error={passwordError}
        />
        <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>
          {copy.button}
        </Button>
      </form>
    </AuthCard>
  );
}
