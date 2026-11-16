"use client";
import { ErrorState } from "@/features/shell/StatusPage";

/** Errors inside the app keep the frame, so navigation still works. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState reset={reset} digest={error.digest} />;
}
