"use client";
/**
 * Settings → Profiles: which notice types the organisation handles, and the
 * languages its notices come in (hints for reading scans and translating).
 */
import { Banner, Checkbox, SettingsRow, SettingsSection, useToast } from "@dueproof/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveLanguages, saveProfiles } from "@/app/actions/settings";
import { LANGUAGES } from "@/lib/languages";
import { PROFILES, type ProfileId } from "@/lib/org-metadata";
import { type SettingsChrome, SettingsFrame } from "./SettingsFrame";
import styles from "./settings.module.css";

export function ProfilesSettings({
  chrome,
  profiles,
  languages,
}: {
  chrome: SettingsChrome;
  profiles: ProfileId[];
  languages: string[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const initial = [...profiles].sort();
  const [value, setValue] = useState(initial);
  const initialLangs = [...languages].sort();
  const [langs, setLangs] = useState(initialLangs);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const typesDirty = JSON.stringify([...value].sort()) !== JSON.stringify(initial);
  const langsDirty = JSON.stringify([...langs].sort()) !== JSON.stringify(initialLangs);
  const dirty = typesDirty || langsDirty;

  const save = async () => {
    setSaving(true);
    setError(null);
    const res = typesDirty ? await saveProfiles(value) : null;
    const lr = res?.ok !== false && langsDirty ? await saveLanguages(langs) : null;
    setSaving(false);
    const failed = res && !res.ok ? res : lr && !lr.ok ? lr : null;
    if (failed && !failed.ok) {
      setError(failed.message);
      return;
    }
    toast({ title: "Saved", tone: "success" });
    router.refresh();
  };

  return (
    <SettingsFrame
      chrome={chrome}
      section="profiles"
      dirty={dirty}
      saving={saving}
      onSave={save}
      onDiscard={() => {
        setValue(initial);
        setLangs(initialLangs);
      }}
      banner={
        error ? (
          <Banner tone="danger" role="alert">
            {error}
          </Banner>
        ) : undefined
      }
    >
      <SettingsSection
        title="Notice types"
        description="The kinds of notice your firm handles. In this version the choice is recorded but doesn't change what Dueproof reads: every notice is read with the full set of rules for Indian notices, whatever is ticked, and statutory deadlines come from each client's registrations."
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
      <SettingsSection
        title="Notice languages"
        description="Tick the Indian languages your notices come in. English is always read. Scans are read with these languages, and a script several languages share (Hindi and Marathi are both Devanagari) is taken as the one you tick. Languages marked “text only” can be read from PDFs with a text layer, not from scans."
      >
        <SettingsRow label="Besides English" stacked>
          <div className={styles.grid}>
            {LANGUAGES.map((l) => (
              <Checkbox
                key={l.code}
                label={l.label}
                {...(l.ocr ? {} : { description: "Text only" })}
                checked={langs.includes(l.code)}
                onCheckedChange={(v) =>
                  setLangs((cur) =>
                    v === true
                      ? [...new Set([...cur, l.code])].sort()
                      : cur.filter((x) => x !== l.code),
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
