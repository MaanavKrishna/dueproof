import { NoAccess } from "@/components/NoAccess";
import { CameraCapture } from "@/features/capture/CameraCapture";
import { InstallGuide } from "@/features/pwa/InstallGuide";
import { pageAccess } from "@/lib/server/page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Capture · Dueproof" };

export default async function CapturePage() {
  const access = await pageAccess("document.upload");
  if (!access.ok) return <NoAccess what="Capture" admins={access.admins} />;
  return <CameraCapture banner={<InstallGuide />} />;
}
