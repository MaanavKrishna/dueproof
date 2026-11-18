import { isFirstRun } from "@dueproof/auth";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignInForm } from "@/features/auth/SignInForm";
import { ssoSignInAvailable } from "@/lib/business";
import { getContainer } from "@/lib/server/container";
import { getViewer, safeNext } from "@/lib/server/page";

// Per request: reads the session and the CSP nonce.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; sso?: string }>;
}) {
  const { next, sso } = await searchParams;
  const target = safeNext(next);
  if (await getViewer()) redirect(target);
  const container = await getContainer();
  const { database, auth } = container;
  // A session without a membership (removed from the team, say) would
  // otherwise sign in and land straight back here, with no reason given.
  const session = await auth.api.getSession({ headers: new Headers(await headers()) });
  const firstRun = await isFirstRun(database);
  // A brand-new install has nobody to sign in as: start setup instead.
  if (firstRun) redirect("/sign-up");
  return (
    <SignInForm
      // Remount after a sign-in that came straight back, so the reason shows.
      key={session ? "no-organisation" : "sign-in"}
      next={target}
      firstRun={firstRun}
      sso={await ssoSignInAvailable(container)}
      ssoError={sso === "failed"}
      noOrganisation={session !== null}
    />
  );
}
