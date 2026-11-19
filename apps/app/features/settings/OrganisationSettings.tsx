"use client";
/**
 * Settings → Organisation: name, country, financial year, time zone, working
 * days, escalation, the report logo and the holiday list.
 */
import { AddIcon, TrashIcon, UploadIcon } from "@dueproof/icons";
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Checkbox,
  Dialog,
  EmptyState,
  IconButton,
  InsetGroupedList,
  Link,
  ListRow,
  Select,
  SettingsRow,
  SettingsSection,
  TextField,
  useToast,
  VisuallyHidden,
} from "@dueproof/ui";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  removeReportLogo,
  saveHolidays,
  saveOrganisation,
  uploadReportLogo,
} from "@/app/actions/settings";
import {
  COUNTRY_OPTIONS,
  FY_OPTIONS,
  ROLE_LABELS,
  TIMEZONE_OPTIONS,
  WEEKDAYS,
} from "@/lib/form-options";
import { type SettingsChrome, SettingsFrame } from "./SettingsFrame";
import styles from "./settings.module.css";

export interface OrganisationData {
  name: string;
  country: string;
  timezone: string;
  fiscalYearStartMonth: number;
  workingDays: number[];
  escalationDays: { manager: number; partner: number };
  reportLogoUrl: string | null;
  hasReportLogo: boolean;
  holidays: Array<{ day: string; name: string }>;
  approvers: Array<{ name: string; role: string }>;
}

interface FormState {
  name: string;
  country: string;
  timezone: string;
  fy: string;
  workingDays: number[];
  manager: string;
  partner: string;
}

function toForm(d: OrganisationData): FormState {
  return {
    name: d.name,
    country: d.country,
    timezone: d.timezone,
    fy: String(d.fiscalYearStartMonth),
    workingDays: [...d.workingDays].sort(),
    manager: String(d.escalationDays.manager),
    partner: String(d.escalationDays.partner),
  };
}

const dayFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const DAY_OPTIONS = [0, 1, 2, 3, 5, 7].map((n) => ({
  value: String(n),
  label: n === 0 ? "The same day" : n === 1 ? "1 day" : `${n} days`,
}));
const PARTNER_OPTIONS = [1, 2, 3, 5, 7, 10, 14].map((n) => ({
  value: String(n),
  label: n === 1 ? "1 day" : `${n} days`,
}));

export function OrganisationSettings({
  chrome,
  data,
}: {
  chrome: SettingsChrome;
  data: OrganisationData;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const initial = toForm(data);
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (change: Partial<FormState>) => setForm((f) => ({ ...f, ...change }));
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const save = async () => {
    setSaving(true);
    setError(null);
    const res = await saveOrganisation({
      name: form.name.trim(),
      country: form.country,
      timezone: form.timezone,
      fiscalYearStartMonth: Number(form.fy),
      workingDays: form.workingDays,
      escalationDays: { manager: Number(form.manager), partner: Number(form.partner) },
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    toast({ title: "Organisation settings saved", tone: "success" });
    router.refresh();
  };

  return (
    <SettingsFrame
      chrome={chrome}
      section="organisation"
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
        title="Organisation"
        description="Your firm's name and logo appear on reports and the evidence report cover."
      >
        <SettingsRow label="Organisation name" stacked>
          <TextField
            label="Organisation name"
            hideLabel
            value={form.name}
            autoComplete="organization"
            onChange={(e) => set({ name: e.target.value })}
          />
        </SettingsRow>
        <SettingsRow label="Country" description="Sets the statutory pack and number formats.">
          <Select
            label="Country"
            hideLabel
            value={form.country}
            onValueChange={(v) => set({ country: v })}
            options={COUNTRY_OPTIONS}
          />
        </SettingsRow>
        <SettingsRow
          label="Financial year"
          description="Used for FY labels and the statutory calendar."
        >
          <Select
            label="Financial year"
            hideLabel
            value={form.fy}
            onValueChange={(v) => set({ fy: v })}
            options={FY_OPTIONS}
          />
        </SettingsRow>
        <SettingsRow label="Time zone" description="Due dates and digests use this time zone.">
          <Select
            label="Time zone"
            hideLabel
            value={form.timezone}
            onValueChange={(v) => set({ timezone: v })}
            options={TIMEZONE_OPTIONS}
          />
        </SettingsRow>
        <ReportLogo
          url={data.reportLogoUrl}
          has={data.hasReportLogo}
          onChange={() => router.refresh()}
        />
      </SettingsSection>

      <SettingsSection
        title="Working days and holidays"
        description="Working-day counts in notices skip non-working days and these holidays."
      >
        <SettingsRow label="Working days" stacked>
          <fieldset className={`${styles.inline} ${styles.fieldset}`} aria-label="Working days">
            {WEEKDAYS.map((d) => (
              <Checkbox
                key={d.value}
                label={d.short}
                aria-label={d.label}
                checked={form.workingDays.includes(d.value)}
                onCheckedChange={(v) =>
                  set({
                    workingDays:
                      v === true
                        ? [...new Set([...form.workingDays, d.value])].sort()
                        : form.workingDays.filter((x) => x !== d.value),
                  })
                }
              />
            ))}
          </fieldset>
        </SettingsRow>
        <Holidays holidays={data.holidays} onChange={() => router.refresh()} />
      </SettingsSection>

      <SettingsSection
        title="Who may approve replies"
        description="Approval can never be given by the person who asked for it."
        actions={<Link href="/settings/team">Change in Team &amp; access</Link>}
      >
        {data.approvers.length === 0 ? (
          <EmptyState
            size="compact"
            headingLevel={3}
            title="Nobody can approve replies"
            description="Turn on “Approves replies” for at least one person in Team & access."
          />
        ) : (
          <InsetGroupedList>
            {data.approvers.map((p) => (
              <ListRow
                key={p.name}
                label={
                  <span className={styles.person}>
                    <Avatar name={p.name} size="xs" />
                    {p.name}
                  </span>
                }
                value={<Badge size="sm">{ROLE_LABELS[p.role] ?? p.role}</Badge>}
              />
            ))}
          </InsetGroupedList>
        )}
      </SettingsSection>

      <SettingsSection
        title="Escalation"
        description="Overdue items go to the manager, then the client's partner."
      >
        <SettingsRow label="Tell the manager after">
          <Select
            label="Tell the manager after"
            hideLabel
            value={form.manager}
            onValueChange={(v) => set({ manager: v })}
            options={DAY_OPTIONS}
          />
        </SettingsRow>
        <SettingsRow label="Tell the partner after">
          <Select
            label="Tell the partner after"
            hideLabel
            value={form.partner}
            onValueChange={(v) => set({ partner: v })}
            options={PARTNER_OPTIONS}
          />
        </SettingsRow>
      </SettingsSection>
    </SettingsFrame>
  );
}

function ReportLogo({
  url,
  has,
  onChange,
}: {
  url: string | null;
  has: boolean;
  onChange: () => void;
}) {
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const form = new FormData();
    form.set("logo", file);
    setBusy(true);
    const res = await uploadReportLogo(form);
    setBusy(false);
    if (input.current) input.current.value = "";
    if (!res.ok) {
      toast({ title: "Couldn't use that image", description: res.message, tone: "danger" });
      return;
    }
    toast({ title: "Logo updated", tone: "success" });
    onChange();
  };

  const remove = async () => {
    setBusy(true);
    const res = await removeReportLogo();
    setBusy(false);
    if (!res.ok) {
      toast({ title: "Couldn't remove the logo", description: res.message, tone: "danger" });
      return;
    }
    onChange();
  };

  return (
    <SettingsRow
      label="Logo for reports"
      description="PNG or JPEG, up to 512 KB. Shown on report covers."
    >
      <div className={styles.inline}>
        {/* biome-ignore lint/performance/noImgElement: a short-lived signed storage URL; the image optimiser can't fetch it. */}
        {has && url ? <img src={url} alt="Current report logo" className={styles.logo} /> : null}
        <VisuallyHidden>
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => upload(e.target.files?.[0])}
          />
        </VisuallyHidden>
        <Button size="sm" icon={UploadIcon} loading={busy} onClick={() => input.current?.click()}>
          {has ? "Replace" : "Upload logo"}
        </Button>
        {has ? (
          <Button size="sm" variant="ghost" onClick={remove} disabled={busy}>
            Remove
          </Button>
        ) : null}
      </div>
    </SettingsRow>
  );
}

type HolidayDraft = { key: number; day: string; name: string };

function Holidays({
  holidays,
  onChange,
}: {
  holidays: Array<{ day: string; name: string }>;
  onChange: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<HolidayDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextKey = useRef(0);

  const begin = () => {
    setRows(holidays.map((h) => ({ key: nextKey.current++, ...h })));
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    const list = rows.filter((r) => r.day || r.name.trim());
    setBusy(true);
    setError(null);
    const res = await saveHolidays(list.map((r) => ({ day: r.day, name: r.name.trim() })));
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setOpen(false);
    toast({ title: `${res.data.length} holidays saved`, tone: "success" });
    onChange();
  };

  const year = new Date().getFullYear();
  const thisYear = holidays.filter((h) => h.day.startsWith(String(year))).length;
  const next = holidays.find((h) => h.day >= new Date().toISOString().slice(0, 10));

  return (
    <>
      <SettingsRow
        label="Holiday list"
        description={
          holidays.length === 0
            ? "No holidays yet. Add your state's list so working-day counts are right."
            : `${thisYear} in ${year}${next ? ` · next: ${next.name}, ${dayFmt.format(new Date(`${next.day}T00:00:00Z`))}` : ""}`
        }
      >
        <Button size="sm" onClick={begin}>
          Edit holidays
        </Button>
      </SettingsRow>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Holidays"
        description="Dates when the firm and the authorities are closed. Working-day counts skip them."
        size="lg"
        dismissible={false}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={busy}>
              Save holidays
            </Button>
          </>
        }
      >
        {error ? (
          <Banner tone="danger" role="alert">
            {error}
          </Banner>
        ) : null}
        <div className={styles.holidayList}>
          {rows.length === 0 ? (
            <EmptyState
              size="compact"
              headingLevel={3}
              title="No holidays"
              description="Add the first one below."
            />
          ) : null}
          {rows.map((r, i) => (
            <div key={r.key} className={styles.holidayRow}>
              <TextField
                label="Date"
                hideLabel={i > 0}
                type="date"
                value={r.day}
                onChange={(e) =>
                  setRows((all) =>
                    all.map((x) => (x.key === r.key ? { ...x, day: e.target.value } : x)),
                  )
                }
              />
              <TextField
                label="Name"
                hideLabel={i > 0}
                value={r.name}
                placeholder="Republic Day"
                onChange={(e) =>
                  setRows((all) =>
                    all.map((x) => (x.key === r.key ? { ...x, name: e.target.value } : x)),
                  )
                }
              />
              <IconButton
                icon={TrashIcon}
                label={`Remove ${r.name || "this holiday"}`}
                onClick={() => setRows((all) => all.filter((x) => x.key !== r.key))}
              />
            </div>
          ))}
        </div>
        <Button
          size="sm"
          variant="secondary"
          icon={AddIcon}
          onClick={() => setRows((all) => [...all, { key: nextKey.current++, day: "", name: "" }])}
        >
          Add a holiday
        </Button>
      </Dialog>
    </>
  );
}
