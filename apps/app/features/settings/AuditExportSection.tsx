"use client";
/**
 * Settings → System → Audit export (Business): the audit trail for a date
 * range as JSONL or CSV with its hash chain, and the verification report an
 * auditor checks it with. Shown only when the licence includes it.
 */
import { DownloadIcon, ShieldCheckIcon } from "@dueproof/icons";
import {
  Button,
  DatePicker,
  type IsoDate,
  SegmentedControl,
  SettingsRow,
  SettingsSection,
} from "@dueproof/ui";
import { useState } from "react";
import styles from "./settings.module.css";

type MaybeDate = IsoDate | null;

export function AuditExportSection() {
  const [from, setFrom] = useState<MaybeDate>(null);
  const [to, setTo] = useState<MaybeDate>(null);
  const [format, setFormat] = useState("jsonl");

  const href = (part: "records" | "report") => {
    const q = new URLSearchParams({ format, part });
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    return `/api/v1/audit-export?${q.toString()}`;
  };
  const download = (part: "records" | "report") => {
    window.location.href = href(part);
  };

  return (
    <SettingsSection
      title="Audit export"
      description="Download the audit trail with its hash chain, and a report that lets anyone check it without Dueproof. Each download is recorded."
    >
      <SettingsRow label="Dates" description="Leave empty for everything.">
        <span className={styles.inline}>
          <DatePicker
            label="From"
            value={from}
            onValueChange={setFrom}
            {...(to ? { max: to } : {})}
          />
          <DatePicker
            label="To"
            value={to}
            onValueChange={setTo}
            {...(from ? { min: from } : {})}
          />
        </span>
      </SettingsRow>
      <SettingsRow
        label="Format"
        description="JSONL can be verified line by line; CSV opens in a spreadsheet."
      >
        <SegmentedControl
          aria-label="Export format"
          size="sm"
          value={format}
          onValueChange={setFormat}
          segments={[
            { value: "jsonl", label: "JSONL" },
            { value: "csv", label: "CSV" },
          ]}
        />
      </SettingsRow>
      <SettingsRow label="Download">
        <span className={styles.inline}>
          <Button size="sm" icon={DownloadIcon} onClick={() => download("records")}>
            Audit trail
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={ShieldCheckIcon}
            onClick={() => download("report")}
          >
            Verification report
          </Button>
        </span>
      </SettingsRow>
    </SettingsSection>
  );
}
