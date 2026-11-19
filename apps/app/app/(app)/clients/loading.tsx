import { ScreenSkeleton } from "@/components/ScreenSkeleton";

/** Shown while Clients loads, so a slow load is never a blank screen (L17). */
export default function Loading() {
  return <ScreenSkeleton title="Clients" cards={2} />;
}
