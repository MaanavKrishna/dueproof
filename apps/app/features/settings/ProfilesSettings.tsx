"use client";
/** Settings → Profiles: which notice vocabularies and statutory calendars are on. */
import { Banner, Checkbox, SettingsRow, SettingsSection, useToast } from "@dueproof/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveProfiles } from "@/app/actions/settings";
import { PROFILES, type ProfileId } from "@/lib/org-metadata";
import { type SettingsChrome, SettingsFrame } from "./SettingsFrame";
import styles from "./settings.module.css";

export function ProfilesSettings({
  chrome,
  profiles,
}: {
  chrome: SettingsChrome;
  profiles: ProfileId[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const initial = [...profiles].sort();
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify([...value].sort()) !== JSON.stringify(initial);

  const save = async () => {
    setSaving(true);
    setError(null);
    const res = await saveProfiles(value);
    setSaving(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    toast({ title: "Notice types saved", tone: "success" });
    router.refresh();
  };

  return (
    <SettingsFrame
      chrome={chrome}
      section="profiles"
      dirty={dirty}
      saving={saving}
      onSave={save}
      onDiscard={() => setValue(initial)}
      banner={
        error ? (
          <Banner tone="danger" role="alert">
            {error}
          </Banner>
        ) : value.length === 0 ? (
          <Banner tone="warning">
            With no notice types on, notices are still stored, but no rules or calendars run.
          </Banner>
        ) : undefined
      }
    >
      <SettingsSection
        title="Notice types"
        description="Dueproof turns on the matching rules and statutory calendars. Every period and rate is data with a source, marked “verify” until a CA signs it off."
      >
        <SettingsRow label="Turned on" stacked>
          <div className={styles.stack}>
            {PROFILES.map((p) => (
              <Checkbox
                key={p.id}
                label={p.label}
                description={p.description}
                checked={value.includes(p.id)}
                onCheckedChange={(v) =>
                  setValue((cur) =>
                    v === true
                      ? [...new Set([...cur, p.id])].sort()
                      : cur.filter((x) => x !== p.id),
                  )
                }
              />
            ))}
          </div>
        </SettingsRow>
      </SettingsSection>
    </SettingsFrame>
  );
}
