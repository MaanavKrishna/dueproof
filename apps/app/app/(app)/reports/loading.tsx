import { ScreenSkeleton } from "@/components/ScreenSkeleton";

/** Shown while Reports loads, so a slow load is never a blank screen (L17). */
export default function Loading() {
  return <ScreenSkeleton title="Reports" cards={4} />;
}
