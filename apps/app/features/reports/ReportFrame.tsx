"use client";
/**
 * An A4 report sheet with the organisation's logo and name, a screen-only
 * bar (back, CSV, print), and a print copy portalled to <body> so printing
 * shows the sheet alone, outside the app frame.
 */
import { ArrowLeftIcon, DownloadIcon, PrintIcon } from "@dueproof/icons";
import { Button, longDate } from "@dueproof/ui";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ReportOrg } from "./queries";
import styles from "./reports.module.css";

export function ReportFrame({
  org,
  title,
  scope,
  generatedOn,
  csvHref,
  children,
}: {
  org: ReportOrg;
  title: string;
  scope?: string;
  generatedOn: string;
  csvHref?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const sheet = (printCopy: boolean) => (
    <article
      className={styles.sheet}
      aria-label={printCopy ? undefined : title}
      aria-hidden={printCopy || undefined}
    >
      <header className={styles.head}>
        <div>
          {org.logoUrl ? (
            // biome-ignore lint/performance/noImgElement: a signed storage URL, printed as is.
            <img className={styles.logo} src={org.logoUrl} alt={org.name} />
          ) : (
            <div className={styles.orgName}>{org.name}</div>
          )}
          {printCopy ? (
            <div className={styles.title}>{title}</div>
          ) : (
            <h1 className={styles.title}>{title}</h1>
          )}
          {scope ? <div className={styles.small}>{scope}</div> : null}
        </div>
        <div className={styles.meta}>
          <div>Prepared {longDate(generatedOn)}</div>
          <div>{org.name}</div>
        </div>
      </header>
      {children}
      <footer className={styles.foot}>
        <span>
          Figures marked “estimate” are computed from the stated inputs, not advice. Dates show the
          rule that produced them.
        </span>
        {org.whiteLabel ? null : <span>Prepared with Dueproof</span>}
      </footer>
    </article>
  );
  return (
    <div className={styles.screen}>
      <div className={styles.bar}>
        <Button variant="plain" icon={ArrowLeftIcon} onClick={() => router.back()}>
          Back
        </Button>
        <div className={styles.barActions}>
          {csvHref ? (
            <Button
              icon={DownloadIcon}
              onClick={() => {
                window.location.href = csvHref;
              }}
            >
              CSV
            </Button>
          ) : null}
          <Button variant="primary" icon={PrintIcon} onClick={() => window.print()}>
            Print or save as PDF
          </Button>
        </div>
      </div>
      {sheet(false)}
      {mounted
        ? createPortal(<div className={styles.printRoot}>{sheet(true)}</div>, document.body)
        : null}
    </div>
  );
}
