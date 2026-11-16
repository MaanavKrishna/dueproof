"use client";
import { ScreenError } from "@/components/ScreenError";

export default function ErrorBoundary({ reset }: { error: Error; reset: () => void }) {
  return <ScreenError what="This case" reset={reset} />;
}
