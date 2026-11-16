import { isFirstRun } from "@dueproof/auth";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignUpForm, type SignUpMode } from "@/features/auth/SignUpForm";
import { getContainer } from "@/lib/server/container";
import { findInvitationByEmail } from "@/lib/server/directory";
import { getViewer } from "@/lib/server/page";

// Per request: reads the session and the CSP nonce.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  if (await getViewer()) redirect("/today");
  const { email } = await searchParams;
  const { database, env } = await getContainer();
  let mode: SignUpMode;
  if (await isFirstRun(database)) {
    mode = { kind: "first" };
  } else {
    const invite =
      typeof email === "string" && email.length <= 254
        ? await findInvitationByEmail(database, email)
        : null;
    if (invite && email)
      mode = { kind: "invite", email, orgName: invite.orgName, role: invite.role };
    else if (env.AUTH_SIGNUP === "open") mode = { kind: "open" };
    else mode = { kind: "closed" };
  }
  return <SignUpForm mode={mode} />;
}
