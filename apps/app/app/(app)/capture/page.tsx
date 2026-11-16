import { CameraCapture } from "@/features/capture/CameraCapture";
import { InstallGuide } from "@/features/pwa/InstallGuide";
import { authorizePage } from "@/lib/page-auth";

export const metadata = { title: "Capture · Dueproof" };

export default async function CapturePage() {
  await authorizePage("document.upload", "/capture");
  return <CameraCapture banner={<InstallGuide />} />;
}
