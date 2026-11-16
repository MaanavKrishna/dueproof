"use client";
/**
 * Settings → System: is everything up, are backups running, is the audit
 * trail intact, which version is this, and which hosts does it talk to.
 */
import { RefreshIcon, ShieldCheckIcon } from "@dueproof/icons";
import {
  Badge,
  Banner,
  Button,
  EmptyState,
  InsetGroupedList,
  ListRow,
  SettingsRow,
  SettingsSection,
  StatusPill,
  useToast,
  VisuallyHidden,
} from "@dueproof/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { loadAuditPage, verifyAuditChain } from "@/app/actions/system";
import { type SettingsChrome, SettingsFrame } from "./SettingsFrame";
import styles from "./settings.module.css";

export interface SystemData {
  status: "ok" | "degraded" | "down";
  database: { ok: boolean; ms: number; error?: string };
  engine: { ok: boolean; ms: number; error?: string; mode: string; translation?: boolean };
  edition: "self-hosted" | "hosted" | "desktop";
  version: string;
  backups: {
    state: "ok" | "failed" | "unknown" | "managed";
    name?: string;
    at?: string;
    message?: string;
    stale?: boolean;
  };
  outbound: Array<{ host: string; purpose: string }>;
  audit: {
    rows: AuditRowData[];
    verify: { ok: boolean; count: number; brokenAt?: number };
  };
}

export interface AuditRowData {
  id: number;
  at: string;
  actorName: string | null;
  action: string;
  targetType: string | null;
  detail: unknown;
}

const timeFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

const ACTIONS: Record<string, string> = {
  "organisation.create": "Created the organisation",
  "member.join": "Joined",
  "member.remove": "Removed a member",
  "member.role.change": "Changed a role",
  "member.approver.change": "Changed who approves replies",
  "member.client_access.change": "Changed client access",
  "invitation.create": "Invited someone",
  "invitation.cancel": "Cancelled an invitation",
  "org.settings.update": "Changed organisation settings",
  "org.holidays.replace": "Updated the holiday list",
  "org.logo.set": "Changed the report logo",
  "org.logo.remove": "Removed the report logo",
  "org.profiles.update": "Changed notice types",
  "org.setup.completed": "Finished setup",
  "org.setup.dismissed": "Left setup",
  "user.update": "Updated their profile",
};

function describe(action: string): string {
  return ACTIONS[action] ?? action.replace(/[._]/g, " ");
}

export function SystemSettings({ chrome, data }: { chrome: SettingsChrome; data: SystemData }) {
  const router = useRouter();
  const { toast } = useToast();
  const [verify, setVerify] = useState<{
    ok: boolean;
    count: number;
    brokenAt?: number;
    checkedAt?: string;
  }>(data.audit.verify);
  const [checking, setChecking] = useState(false);
  const [rows, setRows] = useState(data.audit.rows);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(data.audit.rows.length === 50);
  const [loading, setLoading] = useState(false);

  const runVerify = async () => {
    setChecking(true);
    const res = await verifyAuditChain();
    setChecking(false);
    if (!res.ok) {
      toast({ title: "Couldn't check the audit trail", description: res.message, tone: "danger" });
      return;
    }
    setVerify(res.data);
  };

  const loadMore = async () => {
    setLoading(true);
    const res = await loadAuditPage(page + 1);
    setLoading(false);
    if (!res.ok) {
      toast({ title: "Couldn't load more", description: res.message, tone: "danger" });
      return;
    }
    setRows((r) => [...r, ...res.data]);
    setPage((p) => p + 1);
    setMore(res.data.length === 50);
  };

  const statusPill =
    data.status === "ok" ? (
      <StatusPill label="All systems working" tone="success" />
    ) : data.status === "degraded" ? (
      <StatusPill label="Running with problems" tone="warning" />
    ) : (
      <StatusPill label="Down" tone="danger" />
    );

  return (
    <SettingsFrame
      chrome={chrome}
      section="system"
      banner={
        !verify.ok ? (
          <Banner tone="danger" title="The audit trail doesn't check out">
            Entry {verify.brokenAt} or one before it was changed or removed. Contact support and
            keep your latest backup.
          </Banner>
        ) : data.backups.state === "failed" ||
          (data.backups.state === "ok" && data.backups.stale) ? (
          <Banner tone="warning" title="Backups need attention">
            {data.backups.state === "failed"
              ? "The last backup failed."
              : "The last good backup is more than 48 hours old."}
          </Banner>
        ) : undefined
      }
    >
      <SettingsSection
        title="Health"
        description="Checked when this page loaded."
        actions={
          <Button size="sm" variant="ghost" icon={RefreshIcon} onClick={() => router.refresh()}>
            Check again
          </Button>
        }
      >
        <SettingsRow label="Status">{statusPill}</SettingsRow>
        <SettingsRow label="Database">
          {data.database.ok ? (
            <StatusPill label={`Answering · ${data.database.ms} ms`} tone="success" />
          ) : (
            <StatusPill label={`Not answering (${data.database.error ?? "error"})`} tone="danger" />
          )}
        </SettingsRow>
        <SettingsRow
          label="Reading engine"
          description={
            data.engine.translation === false ? "Offline translation isn't installed." : undefined
          }
        >
          {data.engine.ok ? (
            <StatusPill
              label={
                data.engine.mode === "fake"
                  ? "Recorded (development)"
                  : `Answering · ${data.engine.ms} ms`
              }
              tone={data.engine.mode === "fake" ? "info" : "success"}
            />
          ) : (
            <StatusPill label={`Not answering (${data.engine.error ?? "error"})`} tone="danger" />
          )}
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Backups"
        description={
          data.edition === "hosted"
            ? "We back up your data every night and keep 30 days."
            : "Every night, the backup container saves the database and every original, then checks the copy."
        }
      >
        {data.backups.state === "managed" ? (
          <SettingsRow label="Last backup">
            <StatusPill label="Managed by Dueproof" tone="success" />
          </SettingsRow>
        ) : data.backups.state === "unknown" ? (
          <>
            <SettingsRow label="Last backup" description="This app can't see the backup folder.">
              <Badge>Unknown</Badge>
            </SettingsRow>
            <SettingsRow
              label="How to check"
              description="On the server: docker compose exec backup sh /scripts/backup.sh list. Mount the backups folder into the app read-only and set BACKUP_STATUS_FILE=/backups/last.json to see it here."
            >
              {null}
            </SettingsRow>
          </>
        ) : (
          <SettingsRow
            label="Last backup"
            description={[
              data.backups.name,
              data.backups.at ? timeFmt.format(new Date(data.backups.at)) : null,
              data.backups.message,
            ]
              .filter(Boolean)
              .join(" · ")}
          >
            {data.backups.state === "ok" ? (
              <StatusPill
                label={data.backups.stale ? "Old" : "Verified"}
                tone={data.backups.stale ? "warning" : "success"}
              />
            ) : (
              <StatusPill label="Failed" tone="danger" />
            )}
          </SettingsRow>
        )}
        {data.edition !== "hosted" ? (
          <SettingsRow
            label="Copy backups off this server"
            description="A backup on the same disk doesn't survive the disk. Sync the backups folder to another machine. Keep your .env (it holds AUTH_SECRET) somewhere separate."
          >
            {null}
          </SettingsRow>
        ) : null}
      </SettingsSection>

      <SettingsSection
        title="Audit trail"
        description="Every change, who made it and when. Each entry is chained to the one before, so an edit or a deletion shows."
        actions={
          <Button
            size="sm"
            variant="secondary"
            icon={ShieldCheckIcon}
            loading={checking}
            onClick={runVerify}
          >
            Verify chain
          </Button>
        }
      >
        <SettingsRow
          label="Chain"
          description={
            verify.ok
              ? `${verify.count.toLocaleString("en-IN")} entries, all intact${verify.checkedAt ? ` · checked ${timeFmt.format(new Date(verify.checkedAt))}` : ""}.`
              : `Broken at entry ${verify.brokenAt}.`
          }
        >
          {verify.ok ? (
            <StatusPill label="Intact" tone="success" icon={ShieldCheckIcon} />
          ) : (
            <StatusPill label="Broken" tone="danger" />
          )}
        </SettingsRow>
        {rows.length === 0 ? (
          <EmptyState size="compact" headingLevel={3} title="Nothing recorded yet" />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption>
                <VisuallyHidden>Audit trail, newest first</VisuallyHidden>
              </caption>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Who</th>
                  <th scope="col">What</th>
                  <th scope="col" className={`${styles.end} ${styles.hideNarrow}`}>
                    #
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className={styles.muted}>
                      <time dateTime={r.at}>{timeFmt.format(new Date(r.at))}</time>
                    </td>
                    <td>{r.actorName ?? <span className={styles.muted}>System</span>}</td>
                    <td>{describe(r.action)}</td>
                    <td className={`${styles.end} ${styles.muted} ${styles.hideNarrow}`}>{r.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {more ? (
          <Button size="sm" variant="ghost" onClick={loadMore} loading={loading}>
            Show older entries
          </Button>
        ) : null}
      </SettingsSection>

      <SettingsSection
        title="Network"
        description="Every host this install connects to. Nothing else: no telemetry, no update checks."
      >
        {data.outbound.length === 0 ? (
          <EmptyState
            size="compact"
            headingLevel={3}
            title="No outside connections"
            description="Everything runs on this server."
          />
        ) : (
          <InsetGroupedList>
            {data.outbound.map((o) => (
              <ListRow
                key={o.host}
                label={<span className={styles.mono}>{o.host}</span>}
                value={o.purpose}
              />
            ))}
          </InsetGroupedList>
        )}
      </SettingsSection>

      <SettingsSection title="About">
        <SettingsRow label="Version">
          <span className={styles.mono}>{data.version}</span>
        </SettingsRow>
        <SettingsRow label="Edition">
          <Badge>
            {data.edition === "self-hosted"
              ? "Self-hosted"
              : data.edition === "hosted"
                ? "Hosted"
                : "Desktop"}
          </Badge>
        </SettingsRow>
      </SettingsSection>
    </SettingsFrame>
  );
}
