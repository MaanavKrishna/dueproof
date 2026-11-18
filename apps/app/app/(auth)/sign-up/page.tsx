import { isFirstRun } from "@dueproof/auth";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignUpForm, type SignUpMode } from "@/features/auth/SignUpForm";
import { getContainer } from "@/lib/server/container";
import { findInvitationByToken } from "@/lib/server/directory";
import { getViewer } from "@/lib/server/page";

// Per request: reads the session and the CSP nonce.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sign up" };

/**
 * The invitation, its organisation and role are shown only for a valid
 * invitation token (H1). An address alone reveals nothing: `?email=` is
 * ignored, so this page can't tell anyone whether an address is invited.
 */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  if (await getViewer()) redirect("/today");
  const { invite: token } = await searchParams;
  const { database, env } = await getContainer();
  let mode: SignUpMode;
  if (await isFirstRun(database)) {
    mode = { kind: "first" };
  } else if (typeof token === "string" && token) {
    const invite =
      token.length <= 200 ? await findInvitationByToken(database, env.AUTH_SECRET, token) : null;
    mode = invite
      ? { kind: "invite", email: invite.email, orgName: invite.orgName, role: invite.role, token }
      : { kind: "expired" };
  } else if (env.AUTH_SIGNUP === "open") {
    mode = { kind: "open" };
  } else {
    mode = { kind: "closed" };
  }
  return <SignUpForm mode={mode} />;
}
