"use client";
/**
 * Settings → AI (04 §2, §6, §7): mode, provider and address, the key (shown
 * only as its last four characters), per-tier models for your own key,
 * budget, the Opus cap, redaction, clients kept away from AI, and this
 * month's usage.
 */
import { AiSuggestedIcon, KeyboardIcon } from "@dueproof/icons";
import {
  Banner,
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Radio,
  RadioGroup,
  SearchField,
  Select,
  SettingsRow,
  SettingsSection,
  StatCard,
  Switch,
  TextField,
  useToast,
} from "@dueproof/ui";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { clearAiKey, saveAiSettings, setAiKey } from "@/app/actions/ai-settings";
import {
  type AiModeId,
  aiModeOptions,
  type Edition,
  LOCAL_PROVIDERS,
  needsBaseUrl,
  PROVIDERS,
} from "@/lib/ai-options";
import { type SettingsChrome, SettingsFrame } from "./SettingsFrame";
import styles from "./settings.module.css";

export interface AiData {
  mode: AiModeId;
  provider: string | null;
  baseUrl: string | null;
  routing: { haiku?: string; sonnet?: string; opus?: string };
  monthlyBudgetMinor: number | null;
  opusCapPercent: number;
  redactPii: boolean;
  excludedClientIds: string[];
  keyLast4: string | null;
  canStoreKey: boolean;
  usage: { calls: number; opusCalls: number; costMicroUsd: number };
}

interface Form {
  mode: AiModeId;
  provider: string;
  baseUrl: string;
  haiku: string;
  sonnet: string;
  opus: string;
  budget: string;
  opusCap: string;
  redactPii: boolean;
  excluded: string[];
}

function toForm(d: AiData): Form {
  return {
    mode: d.mode,
    provider: d.provider ?? (d.mode === "local" ? "ollama" : "anthropic"),
    baseUrl: d.baseUrl ?? "",
    haiku: d.routing.haiku ?? "",
    sonnet: d.routing.sonnet ?? "",
    opus: d.routing.opus ?? "",
    budget: d.monthlyBudgetMinor === null ? "" : (d.monthlyBudgetMinor / 100).toString(),
    opusCap: String(d.opusCapPercent),
    redactPii: d.redactPii,
    excluded: [...d.excludedClientIds].sort(),
  };
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const CAP_OPTIONS = [0, 2, 5, 10, 20].map((n) => ({
  value: String(n),
  label: n === 0 ? "Never use Opus" : `Up to ${n}% of calls`,
}));

export function AiSettings({
  chrome,
  data,
  clients,
  edition,
}: {
  chrome: SettingsChrome;
  data: AiData;
  clients: Array<{ id: string; name: string }>;
  edition: Edition;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const initial = toForm(data);
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (c: Partial<Form>) => setForm((f) => ({ ...f, ...c }));
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const budgetValue = form.budget.trim() === "" ? null : Number(form.budget);
  const budgetError =
    budgetValue !== null && (!Number.isFinite(budgetValue) || budgetValue < 0)
      ? "Enter an amount in US dollars, or leave it empty for no limit."
      : undefined;

  const save = async () => {
    if (budgetError) return;
    setSaving(true);
    setError(null);
    const routing =
      form.mode === "byok"
        ? {
            ...(form.haiku.trim() ? { haiku: form.haiku.trim() } : {}),
            ...(form.sonnet.trim() ? { sonnet: form.sonnet.trim() } : {}),
            ...(form.opus.trim() ? { opus: form.opus.trim() } : {}),
          }
        : {};
    const res = await saveAiSettings({
      mode: form.mode,
      provider: form.mode === "byok" || form.mode === "local" ? form.provider : null,
      baseUrl:
        needsBaseUrl(form.mode, form.provider) && form.baseUrl.trim() ? form.baseUrl.trim() : null,
      routing,
      monthlyBudgetMinor: budgetValue === null ? null : Math.round(budgetValue * 100),
      opusCapPercent: Number(form.opusCap),
      redactPii: form.redactPii,
      excludedClientIds: form.excluded,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    toast({ title: "AI settings saved", tone: "success" });
    router.refresh();
  };

  const providerOptions =
    form.mode === "local"
      ? LOCAL_PROVIDERS.map((p) => ({ value: p.value, label: p.label }))
      : PROVIDERS.map((p) => ({ value: p.value, label: p.label }));

  return (
    <SettingsFrame
      chrome={chrome}
      section="ai"
      dirty={dirty}
      saving={saving}
      onSave={save}
      onDiscard={() => {
        setForm(initial);
        setError(null);
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
        title="How AI is used"
        description="Rules read every notice either way. AI helps with the hard ones, and every finding must still be found on the page."
      >
        <SettingsRow label="AI mode" stacked>
          <RadioGroup
            label="AI mode"
            hideLabel
            value={form.mode}
            onValueChange={(v) => {
              const mode = v as AiModeId;
              set({
                mode,
                provider:
                  mode === "local"
                    ? LOCAL_PROVIDERS.some((p) => p.value === form.provider)
                      ? form.provider
                      : "ollama"
                    : PROVIDERS.some((p) => p.value === form.provider)
                      ? form.provider
                      : "anthropic",
              });
            }}
          >
            {aiModeOptions(edition).map((o) => (
              <Radio
                key={o.value}
                value={o.value}
                label={o.label}
                description={o.description}
                disabled={o.disabled && o.value !== data.mode}
              />
            ))}
          </RadioGroup>
        </SettingsRow>
      </SettingsSection>

      {form.mode === "byok" || form.mode === "local" ? (
        <SettingsSection
          title={form.mode === "local" ? "Local model" : "Provider"}
          description={
            form.mode === "local"
              ? "A model server on your own network. Nothing leaves it."
              : "Calls go from this server straight to your provider, billed to your account."
          }
        >
          <SettingsRow label="Provider">
            <Select
              label="Provider"
              hideLabel
              value={form.provider}
              onValueChange={(v) => set({ provider: v })}
              options={providerOptions}
            />
          </SettingsRow>
          {needsBaseUrl(form.mode, form.provider) ? (
            <SettingsRow
              label="Address"
              description={
                form.mode === "local"
                  ? "For example http://ollama:11434/v1"
                  : "The provider's https address."
              }
              stacked
            >
              <TextField
                label="Address"
                hideLabel
                type="url"
                inputMode="url"
                value={form.baseUrl}
                placeholder={form.mode === "local" ? "http://localhost:11434/v1" : "https://"}
                onChange={(e) => set({ baseUrl: e.target.value })}
              />
            </SettingsRow>
          ) : null}
          {form.mode === "byok" ? <KeyRow data={data} onChange={() => router.refresh()} /> : null}
        </SettingsSection>
      ) : null}

      {form.mode === "byok" ? (
        <SettingsSection
          title="Models"
          description="Which of your provider's models to use for each kind of work. Leave empty for the recommended default."
        >
          <SettingsRow label="Fast" description="Classifying and summarising most notices." stacked>
            <TextField
              label="Fast model"
              hideLabel
              value={form.haiku}
              placeholder="claude-haiku-4-5"
              onChange={(e) => set({ haiku: e.target.value })}
            />
          </SettingsRow>
          <SettingsRow label="Standard" description="Reading pages the rules couldn't." stacked>
            <TextField
              label="Standard model"
              hideLabel
              value={form.sonnet}
              placeholder="claude-sonnet-4-5"
              onChange={(e) => set({ sonnet: e.target.value })}
            />
          </SettingsRow>
          <SettingsRow label="Deep" description="Rare, hard cases. Capped below." stacked>
            <TextField
              label="Deep model"
              hideLabel
              value={form.opus}
              placeholder="claude-opus-4-5"
              onChange={(e) => set({ opus: e.target.value })}
            />
          </SettingsRow>
        </SettingsSection>
      ) : null}

      {form.mode !== "off" ? (
        <SettingsSection
          title="Limits and privacy"
          description="Spending, the most expensive model, and what's sent."
        >
          <SettingsRow
            label="Monthly budget"
            description="In US dollars. AI stops for the month when it's reached; rules carry on."
          >
            <TextField
              label="Monthly budget"
              hideLabel
              inputMode="decimal"
              value={form.budget}
              placeholder="No limit"
              onChange={(e) => set({ budget: e.target.value })}
              error={budgetError}
            />
          </SettingsRow>
          <SettingsRow label="Opus" description="The deepest model, for the hardest pages only.">
            <Select
              label="Opus cap"
              hideLabel
              value={form.opusCap}
              onValueChange={(v) => set({ opusCap: v })}
              options={CAP_OPTIONS}
            />
          </SettingsRow>
          <SettingsRow
            label="Redact personal details"
            description="Mask PAN, Aadhaar, phone numbers and emails before text is sent."
          >
            <Switch
              aria-label="Redact personal details"
              checked={form.redactPii}
              onCheckedChange={(v) => set({ redactPii: v })}
            />
          </SettingsRow>
          <SettingsRow
            label="Clients kept away from AI"
            description="Their notices are read by rules only."
          >
            <ExcludedClients
              clients={clients}
              value={form.excluded}
              onChange={(excluded) => set({ excluded })}
            />
          </SettingsRow>
        </SettingsSection>
      ) : null}

      <SettingsSection title="This month" description="Since the 1st, in UTC.">
        <div className={styles.stats}>
          <StatCard
            label="AI calls"
            value={data.usage.calls.toLocaleString("en-IN")}
            icon={AiSuggestedIcon}
          />
          <StatCard label="Opus calls" value={data.usage.opusCalls.toLocaleString("en-IN")} />
          <StatCard
            label="Spent"
            value={usd.format(data.usage.costMicroUsd / 1_000_000)}
            footnote={
              data.monthlyBudgetMinor !== null
                ? `of ${usd.format(data.monthlyBudgetMinor / 100)} budget`
                : "No budget set"
            }
          />
        </div>
      </SettingsSection>
    </SettingsFrame>
  );
}

function KeyRow({ data, onChange }: { data: AiData; onChange: () => void }) {
  const { toast } = useToast();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!data.canStoreKey) {
    return (
      <Banner tone="warning" title="This install can't store keys yet">
        Set AI_KEY_MASTER on the server, then restart. Keys are encrypted with it and never shown
        again.
      </Banner>
    );
  }

  const save = async () => {
    setBusy(true);
    setError(null);
    const res = await setAiKey(key.trim());
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setKey("");
    toast({ title: `Key ending ${res.data.keyLast4} saved`, tone: "success" });
    onChange();
  };

  const clear = async () => {
    const res = await clearAiKey();
    if (!res.ok) {
      toast({ title: "Couldn't remove the key", description: res.message, tone: "danger" });
      return;
    }
    toast({ title: "Key removed" });
    onChange();
  };

  return (
    <SettingsRow
      label="API key"
      description={
        data.keyLast4
          ? `A key ending ${data.keyLast4} is saved. Paste a new one to replace it.`
          : "Stored encrypted. Only its last four characters are ever shown again."
      }
      stacked
    >
      <div className={styles.stack}>
        <TextField
          label="API key"
          hideLabel
          type="password"
          autoComplete="off"
          icon={KeyboardIcon}
          value={key}
          placeholder={data.keyLast4 ? `•••• ${data.keyLast4}` : "Paste your key"}
          onChange={(e) => setKey(e.target.value)}
          error={error ?? undefined}
        />
        <div className={styles.inline}>
          <Button size="sm" onClick={save} loading={busy} disabled={!key.trim()}>
            {data.keyLast4 ? "Replace key" : "Save key"}
          </Button>
          {data.keyLast4 ? (
            <ConfirmDialog
              trigger={
                <Button size="sm" variant="ghost">
                  Remove key
                </Button>
              }
              title="Remove the API key?"
              description="AI stops until you add a key again. Notices are still read by rules."
              confirmLabel="Remove key"
              tone="danger"
              onConfirm={clear}
            />
          ) : null}
        </div>
      </div>
    </SettingsRow>
  );
}

function ExcludedClients({
  clients,
  value,
  onChange,
}: {
  clients: Array<{ id: string; name: string }>;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? clients.filter((c) => c.name.toLowerCase().includes(q)) : clients;
  }, [clients, query]);
  const label =
    value.length === 0 ? "None" : value.length === 1 ? "1 client" : `${value.length} clients`;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setDraft(value);
          setQuery("");
        }
      }}
      trigger={
        <Button size="sm" variant="secondary" aria-label={`Clients kept away from AI: ${label}`}>
          {label}
        </Button>
      }
      title="Clients kept away from AI"
      description="Notices for these clients are never sent to an AI model."
      footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onChange([...draft].sort());
              setOpen(false);
            }}
          >
            Done
          </Button>
        </>
      }
    >
      {clients.length === 0 ? (
        <EmptyState
          size="compact"
          headingLevel={3}
          title="No clients yet"
          description="Add clients first."
        />
      ) : (
        <div className={styles.stack}>
          <SearchField
            label="Find a client"
            placeholder="Find a client"
            value={query}
            onValueChange={setQuery}
          />
          <div className={styles.checkList}>
            {shown.map((c) => (
              <Checkbox
                key={c.id}
                label={c.name}
                checked={draft.includes(c.id)}
                onCheckedChange={(v) =>
                  setDraft((d) => (v === true ? [...d, c.id] : d.filter((x) => x !== c.id)))
                }
              />
            ))}
          </div>
        </div>
      )}
    </Dialog>
  );
}
