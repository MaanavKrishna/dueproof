import type { Metadata } from "next";
import QRCode from "qrcode";
import { IntakeSettings } from "@/features/settings/IntakeSettings";
import { getContainer } from "@/lib/server/container";
import { requireViewer, settingsChrome } from "@/lib/server/page";

export const metadata: Metadata = { title: "Settings · Intake" };

export default async function IntakeSettingsPage() {
  const viewer = await requireViewer();
  const [chrome, { env }] = await Promise.all([settingsChrome(viewer), getContainer()]);
  const captureUrl = new URL("/inbox?capture=1", env.APP_URL).toString();
  const svg = await QRCode.toString(captureUrl, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
  });
  const qrDataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  return <IntakeSettings chrome={chrome} captureUrl={captureUrl} qrDataUri={qrDataUri} />;
}
