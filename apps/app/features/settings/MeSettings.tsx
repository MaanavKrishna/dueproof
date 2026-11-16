"use client";
/**
 * Settings → Me: your name, theme and density (they apply at once), passkeys
 * and two-step verification. Passkeys and TOTP go straight to Better Auth.
 */
import { authClient } from "@dueproof/auth/client";
import {
  AddIcon,
  MonitorIcon,
  MoonIcon,
  ShieldCheckIcon,
  SunIcon,
  TrashIcon,
} from "@dueproof/icons";
import type { Density, Theme } from "@dueproof/tokens";
import {
  Badge,
  Banner,
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  IconButton,
  InsetGroupedList,
  ListRow,
  SegmentedControl,
  SettingsRow,
  SettingsSection,
  TextField,
  useToast,
} from "@dueproof/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { setPreferences, updateProfile } from "@/app/actions/settings";
import { PREFS_STORAGE_KEY, type Preferences } from "@/lib/preferences";
import { type SettingsChrome, SettingsFrame } from "./SettingsFrame";
import styles from "./settings.module.css";

export interface MeData {
  name: string;
  email: string;
  role: string;
  twoFactorEnabled: boolean;
  passkeys: Array<{
    id: string;
    name: string | null;
    deviceType: string;
    createdAt: string | null;
  }>;
  prefs: Preferences;
}

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function MeSettings({ chrome, me }: { chrome: SettingsChrome; me: MeData }) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState(me.name);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState(me.prefs);

  const dirty = name.trim() !== me.name;

  const save = async () => {
    setSaving(true);
    setNameError(null);
    const res = await updateProfile({ name: name.trim() });
    setSaving(false);
    if (!res.ok) {
      setNameError(res.message);
      return;
    }
    toast({ title: "Saved", tone: "success" });
    router.refresh();
  };

  const applyPref = (change: Partial<Preferences>) => {
    const next = { ...prefs, ...change };
    setPrefs(next);
    document.documentElement.dataset.theme = next.theme;
    document.documentElement.dataset.density = next.density;
    try {
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // The cookie still carries it.
    }
    void setPreferences(change);
  };

  return (
    <SettingsFrame
      chrome={chrome}
      section="me"
      dirty={dirty}
      saving={saving}
      onSave={save}
      onDiscard={() => {
        setName(me.name);
        setNameError(null);
      }}
    >
      <SettingsSection
        title="Profile"
        description="How you appear to your team and in the audit trail."
      >
        <SettingsRow label="Name" stacked>
          <TextField
            label="Name"
            hideLabel
            value={name}
            autoComplete="name"
            onChange={(e) => setName(e.target.value)}
            error={nameError ?? undefined}
          />
        </SettingsRow>
        <SettingsRow label="Email" description="You sign in with this address.">
          <span className={styles.muted}>{me.email}</span>
        </SettingsRow>
        <SettingsRow label="Role" description="An owner or admin can change it.">
          <Badge>{me.role.charAt(0).toUpperCase() + me.role.slice(1)}</Badge>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Appearance" description="Applies to this browser straight away.">
        <SettingsRow label="Theme">
          <SegmentedControl
            aria-label="Theme"
            value={prefs.theme}
            onValueChange={(v) => applyPref({ theme: v as Theme })}
            segments={[
              { value: "light", label: "Light", icon: SunIcon },
              { value: "dark", label: "Dark", icon: MoonIcon },
              { value: "system", label: "System", icon: MonitorIcon },
            ]}
          />
        </SettingsRow>
        <SettingsRow label="Density" description="Compact fits more rows on a screen.">
          <SegmentedControl
            aria-label="Density"
            value={prefs.density}
            onValueChange={(v) => applyPref({ density: v as Density })}
            segments={[
              { value: "comfortable", label: "Comfortable" },
              { value: "compact", label: "Compact" },
            ]}
          />
        </SettingsRow>
      </SettingsSection>

      <Passkeys passkeys={me.passkeys} onChange={() => router.refresh()} />
      <TwoFactor enabled={me.twoFactorEnabled} onChange={() => router.refresh()} />
    </SettingsFrame>
  );
}

function Passkeys({ passkeys, onChange }: { passkeys: MeData["passkeys"]; onChange: () => void }) {
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);

  const add = async () => {
    setAdding(true);
    const res = await authClient.passkey.addPasskey({ name: deviceName() });
    setAdding(false);
    if (res?.error) {
      if ((res.error as { code?: string }).code !== "AUTH_CANCELLED")
        toast({ title: "Couldn't add the passkey", description: "Try again.", tone: "danger" });
      return;
    }
    toast({ title: "Passkey added", tone: "success" });
    onChange();
  };

  const remove = async (id: string) => {
    const res = await authClient.passkey.deletePasskey({ id });
    if (res.error) {
      toast({ title: "Couldn't remove the passkey", tone: "danger" });
      return;
    }
    toast({ title: "Passkey removed" });
    onChange();
  };

  return (
    <SettingsSection
      title="Passkeys"
      description="Sign in with your fingerprint, face or device PIN instead of a password."
      actions={
        <Button size="sm" icon={AddIcon} onClick={add} loading={adding}>
          Add a passkey
        </Button>
      }
    >
      {passkeys.length === 0 ? (
        <EmptyState
          size="compact"
          headingLevel={3}
          title="No passkeys yet"
          description="Add one on each device you use. It's quicker and safer than a password."
        />
      ) : (
        <InsetGroupedList>
          {passkeys.map((p) => (
            <ListRow
              key={p.id}
              label={p.name || "Passkey"}
              description={`${p.deviceType === "multiDevice" ? "Synced" : "This device only"}${
                p.createdAt ? ` · added ${dateFmt.format(new Date(p.createdAt))}` : ""
              }`}
              control={
                <ConfirmDialog
                  trigger={
                    <IconButton
                      icon={TrashIcon}
                      label={`Remove ${p.name || "passkey"}`}
                      size="sm"
                    />
                  }
                  title={`Remove ${p.name || "this passkey"}?`}
                  description="You won't be able to sign in with it any more. You can add it again later."
                  confirmLabel="Remove passkey"
                  tone="danger"
                  onConfirm={() => remove(p.id)}
                />
              }
            />
          ))}
        </InsetGroupedList>
      )}
    </SettingsSection>
  );
}

function deviceName(): string {
  const ua = navigator.userAgent;
  const os = /Mac/.test(ua)
    ? "Mac"
    : /iPhone|iPad/.test(ua)
      ? "iPhone or iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : "This device";
  return `${os} · ${new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" }).format(new Date())}`;
}

type Setup = { secret: string; uri: string; backupCodes: string[] };

function TwoFactor({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState<"enable" | "disable" | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(null);
    setPassword("");
    setCode("");
    setSetup(null);
    setError(null);
  };

  const start = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await authClient.twoFactor.enable({ password });
    setBusy(false);
    if (res.error || !res.data || !("totpURI" in res.data)) {
      setError("That password isn't right.");
      return;
    }
    const uri = res.data.totpURI;
    const secret = new URL(uri).searchParams.get("secret") ?? "";
    setSetup({ uri, secret, backupCodes: res.data.backupCodes });
    setPassword("");
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s+/g, "") });
    setBusy(false);
    if (res.error) {
      setError("That code didn't work. Use the current code from your app.");
      return;
    }
    toast({ title: "Two-step verification is on", tone: "success" });
    close();
    onChange();
  };

  const disable = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await authClient.twoFactor.disable({ password });
    setBusy(false);
    if (res.error) {
      setError("That password isn't right.");
      return;
    }
    toast({ title: "Two-step verification is off" });
    close();
    onChange();
  };

  return (
    <SettingsSection
      title="Two-step verification"
      description="Ask for a code from an authenticator app when you sign in with a password."
    >
      <SettingsRow
        label={
          <span className={styles.inline}>
            Authenticator app
            {enabled ? (
              <Badge tone="success" size="sm">
                On
              </Badge>
            ) : (
              <Badge size="sm">Off</Badge>
            )}
          </span>
        }
        description={
          enabled
            ? "You'll be asked for a code on new devices."
            : "Recommended for owners and admins."
        }
      >
        {enabled ? (
          <Button size="sm" variant="secondary" onClick={() => setOpen("disable")}>
            Turn off
          </Button>
        ) : (
          <Button size="sm" icon={ShieldCheckIcon} onClick={() => setOpen("enable")}>
            Turn on
          </Button>
        )}
      </SettingsRow>

      <Dialog
        open={open === "enable"}
        onOpenChange={(o) => (o ? setOpen("enable") : close())}
        title="Turn on two-step verification"
        description={
          setup
            ? "Add this account to your authenticator app, then enter the code it shows."
            : "Confirm your password to begin."
        }
        dismissible={false}
      >
        {error ? (
          <Banner tone="danger" role="alert">
            {error}
          </Banner>
        ) : null}
        {!setup ? (
          <form className={styles.stack} onSubmit={start}>
            <TextField
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className={styles.inline}>
              <Button type="submit" variant="primary" loading={busy} disabled={!password}>
                Continue
              </Button>
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <form className={styles.stack} onSubmit={verify}>
            <div>
              <div className={styles.detail}>Setup key (type it into your app)</div>
              <div className={styles.mono}>{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</div>
            </div>
            <div>
              <div className={styles.detail}>
                Backup codes. Keep them somewhere safe; each works once.
              </div>
              <ul className={styles.codes} aria-label="Backup codes">
                {setup.backupCodes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
            <TextField
              label="Code from your app"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <div className={styles.inline}>
              <Button type="submit" variant="primary" loading={busy} disabled={!code.trim()}>
                Verify and turn on
              </Button>
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      <Dialog
        open={open === "disable"}
        onOpenChange={(o) => (o ? setOpen("disable") : close())}
        title="Turn off two-step verification?"
        description="Signing in will need only your password or a passkey."
      >
        {error ? (
          <Banner tone="danger" role="alert">
            {error}
          </Banner>
        ) : null}
        <form className={styles.stack} onSubmit={disable}>
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className={styles.inline}>
            <Button type="submit" variant="destructive" loading={busy} disabled={!password}>
              Turn off
            </Button>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>
    </SettingsSection>
  );
}
