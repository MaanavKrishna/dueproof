"use client";
/**
 * Settings → Team → Single sign-on (Business, SAML): give the IdP our two
 * URLs, then paste its metadata with your email domain and the role new
 * people get. Shown only while the licence includes SSO.
 */
import type { SsoProviderView } from "@dueproof/plugins";
import {
  Button,
  Select,
  SettingsRow,
  SettingsSection,
  StatusPill,
  TextArea,
  TextField,
  useToast,
} from "@dueproof/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { removeSso, saveSso } from "@/app/actions/business";
import styles from "./settings.module.css";

export interface SsoData {
  providers: SsoProviderView[];
  serviceProvider: { acsUrl: string; spEntityId: string };
  canManage: boolean;
}

const ROLE_OPTIONS = [
  { value: "viewer", label: "Viewer" },
  { value: "member", label: "Member" },
  { value: "manager", label: "Manager" },
];

export function SsoSection({ data }: { data: SsoData }) {
  const router = useRouter();
  const { toast } = useToast();
  const current = data.providers[0];
  const [metadataUrl, setMetadataUrl] = useState("");
  const [metadataXml, setMetadataXml] = useState("");
  const [domains, setDomains] = useState(current?.domains.join(", ") ?? "");
  const [defaultRole, setDefaultRole] = useState<string>(current?.defaultRole ?? "member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    const res = await saveSso({
      ...(metadataUrl.trim() ? { metadataUrl } : {}),
      ...(metadataXml.trim() ? { metadataXml } : {}),
      domains,
      defaultRole,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setMetadataUrl("");
    setMetadataXml("");
    toast({ title: "Single sign-on saved", tone: "success" });
    router.refresh();
  };

  const remove = async () => {
    if (!current) return;
    setBusy(true);
    const res = await removeSso(current.providerId);
    setBusy(false);
    if (!res.ok) {
      toast({
        title: "Couldn't turn off single sign-on",
        description: res.message,
        tone: "danger",
      });
      return;
    }
    toast({ title: "Single sign-on is off" });
    router.refresh();
  };

  return (
    <SettingsSection
      title="Single sign-on"
      description="People on your email domain sign in through your identity provider (SAML: Microsoft Entra ID, Google Workspace, Okta). Owners keep their password."
      actions={
        current && data.canManage ? (
          <Button size="sm" variant="ghost" onClick={remove} loading={busy}>
            Turn off
          </Button>
        ) : undefined
      }
    >
      <SettingsRow label="Status">
        {current ? (
          <StatusPill label={`On for ${current.domains.join(", ")}`} tone="success" />
        ) : (
          <StatusPill label="Not set up" tone="neutral" />
        )}
      </SettingsRow>
      <SettingsRow
        label="ACS (reply) URL"
        description="Give this to your identity provider."
        stacked
      >
        <span className={styles.mono}>{data.serviceProvider.acsUrl}</span>
      </SettingsRow>
      <SettingsRow
        label="Entity ID (audience)"
        description="Send the email address as the NameID."
        stacked
      >
        <span className={styles.mono}>{data.serviceProvider.spEntityId}</span>
      </SettingsRow>
      {current ? (
        <SettingsRow label="Identity provider">
          <span className={styles.mono}>{current.issuer}</span>
        </SettingsRow>
      ) : null}
      {data.canManage ? (
        <>
          <SettingsRow
            label="IdP metadata URL"
            description="Or paste the metadata XML below."
            stacked
          >
            <TextField
              label="IdP metadata URL"
              hideLabel
              type="url"
              inputMode="url"
              placeholder="https://login.microsoftonline.com/…/federationmetadata.xml"
              value={metadataUrl}
              onChange={(e) => setMetadataUrl(e.target.value)}
            />
          </SettingsRow>
          <SettingsRow label="IdP metadata XML" stacked>
            <TextArea
              label="IdP metadata XML"
              hideLabel
              rows={4}
              spellCheck={false}
              value={metadataXml}
              onChange={(e) => setMetadataXml(e.target.value)}
            />
          </SettingsRow>
          <SettingsRow label="Email domains" description="Separate several with commas." stacked>
            <TextField
              label="Email domains"
              hideLabel
              placeholder="firm.in"
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
              error={error ?? undefined}
            />
          </SettingsRow>
          <SettingsRow
            label="New people join as"
            description="Make owners and admins in the list above."
          >
            <Select
              label="New people join as"
              hideLabel
              value={defaultRole}
              onValueChange={setDefaultRole}
              options={ROLE_OPTIONS}
            />
          </SettingsRow>
          <SettingsRow label="Save">
            <Button variant="primary" onClick={save} loading={busy}>
              {current ? "Save changes" : "Turn on single sign-on"}
            </Button>
          </SettingsRow>
        </>
      ) : null}
    </SettingsSection>
  );
}
