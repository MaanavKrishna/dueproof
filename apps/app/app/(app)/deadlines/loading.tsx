import { ScreenSkeleton } from "@/components/ScreenSkeleton";

/** Shown while Deadlines loads, so a slow load is never a blank screen (L17). */
export default function Loading() {
  return <ScreenSkeleton title="Deadlines" cards={3} />;
}
