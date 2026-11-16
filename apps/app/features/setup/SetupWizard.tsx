"use client";
/**
 * First-run setup (01 §4): the admin account (done at sign-up), then the
 * organisation and its financial year, notice types, AI mode (off by
 * default), the team, and a first notice. Each step saves as you go, so
 * leaving half-way loses nothing; everything can be changed in Settings.
 */
import { CopyIcon, UploadIcon } from "@dueproof/icons";
import {
  Banner,
  Button,
  Card,
  Checkbox,
  IconButton,
  Radio,
  RadioGroup,
  Select,
  TextArea,
  TextField,
  useToast,
  type WizardStep,
  WizardTemplate,
} from "@dueproof/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveAiSettings, setAiKey } from "@/app/actions/ai-settings";
import { finishSetup, saveLanguages, saveOrganisation, saveProfiles } from "@/app/actions/settings";
import { inviteMembers } from "@/app/actions/team";
import { Wordmark } from "@/components/Wordmark";
import { type AiModeId, aiModeOptions, type Edition, PROVIDERS } from "@/lib/ai-options";
import { COUNTRY_OPTIONS, FY_OPTIONS, ROLE_OPTIONS, TIMEZONE_OPTIONS } from "@/lib/form-options";
import { LANGUAGES } from "@/lib/languages";
import { PROFILES, type ProfileId } from "@/lib/org-metadata";

const STEPS: WizardStep[] = [
  {
    id: "admin",
    label: "Your account",
    title: "Create the admin account",
    description: "You'll manage the firm's settings, people and backups.",
  },
  {
    id: "org",
    label: "Organisation",
    title: "Name your organisation",
    description: "It appears on reports. You can change it later.",
  },
  {
    id: "profiles",
    label: "Notice types",
    title: "Which notices do you handle?",
    description: "Dueproof turns on the matching rules and statutory calendars.",
  },
  {
    id: "ai",
    label: "AI",
    title: "Choose how AI is used",
    description: "AI is off by default. Rules read every notice either way.",
  },
  {
    id: "team",
    label: "Invite your team",
    title: "Invite your team",
    description: "We'll email each person a sign-up link. You can copy it too.",
  },
  {
    id: "first",
    label: "First notice",
    title: "Upload your first notice",
    description: "We'll read it and show you each date on its page.",
  },
];

export interface SetupInitial {
  name: string;
  country: string;
  timezone: string;
  fiscalYearStartMonth: number;
  profiles: ProfileId[];
  languages: string[];
  aiMode: AiModeId;
  aiProvider: string | null;
  canStoreKey: boolean;
  edition: Edition;
  appUrl: string;
}

export function SetupWizard({ initial }: { initial: SetupInitial }) {
  const router = useRouter();
  const { toast } = useToast();
  const [current, setCurrent] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const [name, setName] = useState(initial.name);
  const [country, setCountry] = useState(initial.country);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [fy, setFy] = useState(String(initial.fiscalYearStartMonth));
  const [profiles, setProfiles] = useState<ProfileId[]>(initial.profiles);
  const [languages, setLanguages] = useState<string[]>(initial.languages);
  const [aiMode, setAiMode] = useState<AiModeId>(initial.aiMode);
  const [provider, setProvider] = useState(initial.aiProvider ?? "anthropic");
  const [apiKey, setApiKey] = useState("");
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState("member");
  const [invited, setInvited] = useState<Array<{ email: string; link: string; emailed: boolean }>>(
    [],
  );

  const step = STEPS[current];
  const go = (n: number) => {
    setError(null);
    setFailed(null);
    setCurrent(n);
  };

  const parsedEmails = emails
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter(Boolean);
  const badEmail = parsedEmails.find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

  const canProceed =
    step?.id === "org"
      ? name.trim().length > 1
      : step?.id === "profiles"
        ? profiles.length > 0
        : step?.id === "team"
          ? !badEmail
          : step?.id === "ai"
            ? aiMode !== "byok" || Boolean(provider)
            : true;

  async function saveStep(): Promise<boolean> {
    switch (step?.id) {
      case "org": {
        const res = await saveOrganisation({
          name: name.trim(),
          country,
          timezone,
          fiscalYearStartMonth: Number(fy),
        });
        if (!res.ok) setError(res.message);
        return res.ok;
      }
      case "profiles": {
        const res = await saveProfiles(profiles);
        if (!res.ok) {
          setError(res.message);
          return false;
        }
        const langs = await saveLanguages(languages);
        if (!langs.ok) setError(langs.message);
        return langs.ok;
      }
      case "ai": {
        const res = await saveAiSettings({
          mode: aiMode,
          provider: aiMode === "byok" ? provider : null,
        });
        if (!res.ok) {
          setFailed(res.message);
          return false;
        }
        if (aiMode === "byok" && apiKey.trim()) {
          const key = await setAiKey(apiKey.trim());
          if (!key.ok) {
            setFailed(key.message);
            return false;
          }
          setApiKey("");
        }
        return true;
      }
      case "team": {
        if (parsedEmails.length === 0) return true;
        const res = await inviteMembers({ emails: parsedEmails, role });
        if (!res.ok) {
          setError(res.message);
          return false;
        }
        const people = res.data.invited.map((i) => ({
          email: i.email,
          link: i.link,
          emailed: i.emailed,
        }));
        setInvited((cur) => [
          ...cur.filter((c) => !people.some((p) => p.email === c.email)),
          ...people,
        ]);
        const n = people.length;
        toast({
          title: n === 1 ? "1 person invited" : `${n} people invited`,
          description: people.every((p) => p.emailed)
            ? "We've emailed each of them a sign-up link."
            : "Copy each link below and send it to them.",
          tone: "success",
        });
        setEmails("");
        // Stay on this step so the links can be copied; Next then moves on.
        return n === 0;
      }
      case "first": {
        const res = await finishSetup("completed");
        if (!res.ok) setError(res.message);
        return res.ok;
      }
      default:
        return true;
    }
  }

  const next = async () => {
    setBusy(true);
    setError(null);
    setFailed(null);
    const ok = await saveStep();
    setBusy(false);
    if (!ok) return;
    if (step?.id === "first") {
      router.push("/inbox?upload=1");
      return;
    }
    go(Math.min(STEPS.length - 1, current + 1));
  };

  const leave = async () => {
    await finishSetup("dismissed");
    router.push("/today");
  };

  const steps = STEPS.map((s) =>
    s.id === "ai" && failed ? { ...s, error: true, description: failed } : s,
  );

  return (
    <WizardTemplate
      title="Set up Dueproof"
      brand={<Wordmark name={name || "Dueproof"} compactOnPhone />}
      steps={steps}
      current={current}
      {...(current > 1 ? { onBack: () => go(current - 1) } : {})}
      onNext={next}
      onCancel={leave}
      onSkip={step?.id === "team" || step?.id === "ai" ? () => go(current + 1) : undefined}
      canProceed={canProceed}
      busy={busy}
      finishLabel="Go to Inbox"
      aside={
        initial.edition === "hosted" ? (
          <>
            <strong>Hosted by Dueproof</strong>
            <p>You can change any of this later in Settings.</p>
          </>
        ) : (
          <>
            <strong>{initial.edition === "desktop" ? "On this computer" : "Self-hosted"}</strong>
            <p>Everything stays on this server. You can change any of this in Settings.</p>
          </>
        )
      }
    >
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}
      {step?.id === "org" ? (
        <>
          <TextField
            label="Organisation name"
            value={name}
            autoComplete="organization"
            onChange={(e) => setName(e.target.value)}
          />
          <Select
            label="Country"
            value={country}
            onValueChange={setCountry}
            options={COUNTRY_OPTIONS}
          />
          <Select
            label="Financial year"
            value={fy}
            onValueChange={setFy}
            options={FY_OPTIONS}
            description="Used for FY labels and the statutory calendar."
          />
          <Select
            label="Time zone"
            value={timezone}
            onValueChange={setTimezone}
            options={TIMEZONE_OPTIONS}
          />
        </>
      ) : null}
      {step?.id === "profiles"
        ? PROFILES.map((p) => (
            <Checkbox
              key={p.id}
              label={p.label}
              description={p.description}
              checked={profiles.includes(p.id)}
              onCheckedChange={(v) =>
                setProfiles((cur) =>
                  v === true ? [...new Set([...cur, p.id])] : cur.filter((x) => x !== p.id),
                )
              }
            />
          ))
        : null}
      {step?.id === "profiles" ? (
        <Card variant="sunken" padding="md">
          <p>
            <strong>Notice languages.</strong> English is always read. Tick any Indian languages
            your notices come in, so scans are read in them. All 22 are in Settings → Profiles.
          </p>
          {LANGUAGES.filter((l) => l.ocr || languages.includes(l.code)).map((l) => (
            <Checkbox
              key={l.code}
              label={l.label}
              checked={languages.includes(l.code)}
              onCheckedChange={(v) =>
                setLanguages((cur) =>
                  v === true ? [...new Set([...cur, l.code])] : cur.filter((x) => x !== l.code),
                )
              }
            />
          ))}
        </Card>
      ) : null}
      {step?.id === "ai" ? (
        <>
          <RadioGroup
            label="AI mode"
            value={aiMode}
            onValueChange={(v) => setAiMode(v as AiModeId)}
          >
            {aiModeOptions(initial.edition).map((o) => (
              <Radio
                key={o.value}
                value={o.value}
                label={o.label}
                description={o.description}
                disabled={o.disabled}
              />
            ))}
          </RadioGroup>
          {aiMode === "byok" ? (
            <>
              <Select
                label="Provider"
                value={provider}
                onValueChange={setProvider}
                options={PROVIDERS.map((p) => ({ value: p.value, label: p.label }))}
              />
              <TextField
                label="API key"
                type="password"
                autoComplete="off"
                optional
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                description={
                  initial.canStoreKey
                    ? "Stored encrypted. Only its last four characters are ever shown again."
                    : "This install can't store keys yet (AI_KEY_MASTER isn't set). Add it later in Settings → AI."
                }
                disabled={!initial.canStoreKey}
              />
            </>
          ) : null}
        </>
      ) : null}
      {step?.id === "team" ? (
        <>
          <TextArea
            label="Email addresses"
            description="One per line, or separated by commas."
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            error={badEmail ? `“${badEmail}” isn't an email address.` : undefined}
            rows={4}
          />
          <Select label="Role" value={role} onValueChange={setRole} options={ROLE_OPTIONS} />
          {invited.length > 0 ? (
            <Card variant="sunken" padding="md">
              <p>
                <strong>Invited.</strong> Each link opens sign-up with the address filled in. It
                works for 14 days.
              </p>
              <ul aria-label="Invitation links">
                {invited.map((i) => (
                  <li key={i.email}>
                    {i.email} · {i.emailed ? "emailed" : "not emailed: send the link yourself"}{" "}
                    <IconButton
                      icon={CopyIcon}
                      size="sm"
                      label={`Copy sign-up link for ${i.email}`}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(i.link);
                          toast({ title: "Sign-up link copied", description: "Send it to them." });
                        } catch {
                          toast({ title: "Couldn't copy", description: i.link });
                        }
                      }}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      ) : null}
      {step?.id === "first" ? (
        <Card variant="sunken" padding="lg">
          <p>
            Drop a PDF or a photo of a notice into the Inbox. Dueproof reads it, finds each date and
            amount, and outlines it on the page it came from.
          </p>
          <Button
            icon={UploadIcon}
            variant="secondary"
            onClick={() => router.push("/inbox?upload=1")}
          >
            Open the Inbox
          </Button>
        </Card>
      ) : null}
    </WizardTemplate>
  );
}
