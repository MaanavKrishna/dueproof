import { isFirstRun } from "@dueproof/auth";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInForm } from "@/features/auth/SignInForm";
import { getContainer } from "@/lib/server/container";
import { getViewer, safeNext } from "@/lib/server/page";

// Per request: reads the session and the CSP nonce.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const target = safeNext(next);
  if (await getViewer()) redirect(target);
  const { database } = await getContainer();
  const firstRun = await isFirstRun(database);
  // A brand-new install has nobody to sign in as: start setup instead.
  if (firstRun) redirect("/sign-up");
  return <SignInForm next={target} firstRun={firstRun} />;
}
