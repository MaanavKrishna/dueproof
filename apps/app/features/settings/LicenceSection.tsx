"use client";
/**
 * Settings → System → Licence (08 §5): paste or upload the Business licence
 * file, see what it unlocks and when it ends. Verification is offline; no
 * licence state blocks the free product.
 */
import {
  type BusinessFeature,
  FEATURE_LABELS,
  isBusinessFeature,
  type LicenceStatus,
  V01_FEATURES,
} from "@dueproof/plugins";
import {
  Badge,
  Banner,
  Button,
  FileDropZone,
  SettingsRow,
  SettingsSection,
  StatusPill,
  Tag,
  TextArea,
  useToast,
} from "@dueproof/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { installLicence, removeLicence } from "@/app/actions/business";
import styles from "./settings.module.css";

export interface LicenceData {
  /** ee/ is in this build. */
  available: boolean;
  status: LicenceStatus;
  members: number;
  /** Owners install and remove licences. */
  canManage: boolean;
}

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});
const day = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(iso)) : "");

/** The banner Settings → System shows for a licence that needs attention, if any. */
export function licenceBanner(status: LicenceStatus) {
  switch (status.state) {
    case "expiring":
      return (
        <Banner tone="warning" title={`Your Business licence ends in ${status.daysLeft} days`}>
          It ends on {day(status.licence?.expiresAt)}. Renew it to keep single sign-on, audit export
          and white-label reports. Nothing else changes.
        </Banner>
      );
    case "grace":
      return (
        <Banner tone="danger" title="Your Business licence has expired">
          Business features stay on until {day(status.graceEndsAt)} ({status.daysLeft} days). Then
          single sign-on, audit export and white-label reports switch off. No data is lost.
        </Banner>
      );
    case "expired":
    case "invalid":
      return (
        <Banner tone="danger" title="Business features are off">
          {status.problem}
        </Banner>
      );
    default:
      return null;
  }
}

function statePill(status: LicenceStatus) {
  switch (status.state) {
    case "valid":
      return <StatusPill label="Active" tone="success" />;
    case "expiring":
      return <StatusPill label={`Ends in ${status.daysLeft} days`} tone="warning" />;
    case "grace":
      return <StatusPill label={`Expired · ${status.daysLeft} days of grace`} tone="danger" />;
    case "expired":
      return <StatusPill label="Expired" tone="danger" />;
    case "invalid":
      return <StatusPill label="Not valid" tone="danger" />;
    default:
      return <Badge>Free</Badge>;
  }
}

export function LicenceSection({ data }: { data: LicenceData }) {
  const router = useRouter();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const { status } = data;
  const licence = status.licence;

  const install = async (fileText: string) => {
    setBusy(true);
    const res = await installLicence(fileText);
    setBusy(false);
    if (!res.ok) {
      toast({ title: "Couldn't install the licence", description: res.message, tone: "danger" });
      return;
    }
    setText("");
    toast({ title: "Licence installed", tone: "success" });
    router.refresh();
  };

  const remove = async () => {
    setBusy(true);
    const res = await removeLicence();
    setBusy(false);
    if (!res.ok) {
      toast({ title: "Couldn't remove the licence", description: res.message, tone: "danger" });
      return;
    }
    toast({ title: "Licence removed" });
    router.refresh();
  };

  if (!data.available)
    return (
      <SettingsSection
        title="Licence"
        description="This is Self-hosted Free: everything that reads, proves and tracks notices, with no limits."
      >
        <SettingsRow
          label="Business features"
          description="Single sign-on, audit export and white-label reports come with a Business licence and the Business build."
        >
          <Badge>Free</Badge>
        </SettingsRow>
      </SettingsSection>
    );

  const known = (licence?.features ?? []).filter(isBusinessFeature) as BusinessFeature[];
  const overSeats = licence?.seats != null && data.members > licence.seats;

  return (
    <SettingsSection
      title="Licence"
      description="Checked on this server, offline. Nothing is sent anywhere."
      actions={
        licence && data.canManage ? (
          <Button size="sm" variant="ghost" onClick={remove} loading={busy}>
            Remove licence
          </Button>
        ) : undefined
      }
    >
      {licenceBanner(status)}
      <SettingsRow label="Status">{statePill(status)}</SettingsRow>
      {licence ? (
        <>
          <SettingsRow label="Licensed to" description={licence.orgName}>
            <span>{licence.licensee}</span>
          </SettingsRow>
          <SettingsRow label="Features">
            <span className={styles.inline}>
              {known.length === 0 ? <span className={styles.muted}>None</span> : null}
              {known.map((f) => (
                <Tag
                  key={f}
                  size="sm"
                  label={
                    V01_FEATURES.includes(f) ? FEATURE_LABELS[f] : `${FEATURE_LABELS[f]} (later)`
                  }
                />
              ))}
            </span>
          </SettingsRow>
          <SettingsRow
            label="Seats"
            description={
              overSeats ? "More people than the licence covers. Nobody is locked out." : undefined
            }
          >
            <span>
              {data.members} of {licence.seats ?? "unlimited"}
            </span>
          </SettingsRow>
          <SettingsRow label="Expires" description={`Licence ${licence.licenceId}`}>
            <span>{day(licence.expiresAt)}</span>
          </SettingsRow>
        </>
      ) : null}
      {data.canManage ? (
        <SettingsRow
          label={licence ? "Replace the licence" : "Install a licence"}
          description="Paste the licence file you were sent, or drop it here."
          stacked
        >
          <div className={styles.stack}>
            <TextArea
              label="Licence file"
              hideLabel
              rows={4}
              spellCheck={false}
              value={text}
              placeholder='{ "dueproofLicence": 1, … }'
              onChange={(e) => setText(e.target.value)}
            />
            <FileDropZone
              title="Drop the licence file"
              accept=".dueproof-licence,.json,.txt"
              maxSize={16 * 1024}
              multiple={false}
              folders={false}
              disabled={busy}
              onFiles={async (files) => {
                const f = files[0];
                if (f) await install(await f.text());
              }}
            />
            <span className={styles.inline}>
              <Button
                variant="primary"
                onClick={() => install(text)}
                loading={busy}
                disabled={!text.trim()}
              >
                Install licence
              </Button>
            </span>
          </div>
        </SettingsRow>
      ) : (
        <SettingsRow label="Install or renew" description="An owner installs the licence.">
          {null}
        </SettingsRow>
      )}
    </SettingsSection>
  );
}
