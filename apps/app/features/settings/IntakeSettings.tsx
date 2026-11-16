"use client";
/**
 * Settings → Intake: the ways notices come in. Upload from a phone works
 * today (scan the code); email-in and WhatsApp are on their way.
 */
import { CopyIcon } from "@dueproof/icons";
import { Badge, Button, SettingsRow, SettingsSection, useToast } from "@dueproof/ui";
import { type SettingsChrome, SettingsFrame } from "./SettingsFrame";
import styles from "./settings.module.css";

export function IntakeSettings({
  chrome,
  captureUrl,
  qrDataUri,
}: {
  chrome: SettingsChrome;
  captureUrl: string;
  qrDataUri: string;
}) {
  const { toast } = useToast();
  return (
    <SettingsFrame chrome={chrome} section="intake">
      <SettingsSection
        title="Upload from your phone"
        description="Scan this with your phone's camera, sign in, and photograph a notice. It lands in the Inbox."
      >
        <SettingsRow label="Phone upload" description={captureUrl} stacked>
          <div className={styles.inline}>
            {/* biome-ignore lint/performance/noImgElement: a data: URI made on the server; nothing to optimise. */}
            <img src={qrDataUri} alt={`QR code for ${captureUrl}`} className={styles.qr} />
            <Button
              size="sm"
              variant="secondary"
              icon={CopyIcon}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(captureUrl);
                  toast({ title: "Link copied" });
                } catch {
                  toast({ title: "Couldn't copy", description: captureUrl });
                }
              }}
            >
              Copy link
            </Button>
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Email in"
        description="Forward notices to your organisation's own address and they're read like an upload."
      >
        <SettingsRow label="Address" description="Each organisation gets its own address.">
          <Badge>Coming soon</Badge>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="WhatsApp"
        description="Clients and staff send a photo or PDF to your firm's WhatsApp number."
      >
        <SettingsRow label="WhatsApp number" description="Connect a WhatsApp Business number.">
          <Badge>Coming soon</Badge>
        </SettingsRow>
      </SettingsSection>
    </SettingsFrame>
  );
}
