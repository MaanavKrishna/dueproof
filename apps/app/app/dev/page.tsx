/**
 * A bare page to exercise sign-up, sign-in and upload end to end while the
 * real screens are built (lanes L1/L6 own the UI). Off in production unless
 * DUEPROOF_DEV_PAGES=1.
 */
import { notFound } from "next/navigation";
import { getEnv } from "@/lib/env";
import { DevHarness } from "./harness";

export const dynamic = "force-dynamic";

export default function DevPage() {
  if (!getEnv().DUEPROOF_DEV_PAGES) notFound();
  return (
    <main>
      <h1>Dueproof platform harness</h1>
      <p>Unstyled, for checking the plumbing: sign up, sign in, upload, watch processing.</p>
      <DevHarness />
    </main>
  );
}
