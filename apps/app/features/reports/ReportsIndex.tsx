"use client";
/** Reports: pick a report and its scope. Every report prints on A4 and has a CSV. */
import { ExposureIcon, HearingPackIcon, ProofIcon, UserIcon, UsersIcon } from "@dueproof/icons";
import { Button, Card, Combobox, Grid, ListPageTemplate, TextField } from "@dueproof/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./reports.module.css";

type Option = { id: string; name: string };

export function ReportsIndex({
  clients,
  cases,
  canSeeExposure,
}: {
  clients: Option[];
  cases: Option[];
  canSeeExposure: boolean;
}) {
  const router = useRouter();
  const [evCase, setEvCase] = useState<string | null>(null);
  const [evClient, setEvClient] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [stClient, setStClient] = useState<string | null>(null);
  const [packCase, setPackCase] = useState<string | null>(null);
  const clientOptions = clients.map((c) => ({ value: c.id, label: c.name }));
  const caseOptions = cases.map((c) => ({ value: c.id, label: c.name }));

  function openEvidence() {
    const q = new URLSearchParams();
    if (evCase) q.set("case", evCase);
    if (evClient) q.set("client", evClient);
    if (from && to) q.set("range", `${from}..${to}`);
    router.push(`/reports/evidence?${q.toString()}`);
  }

  return (
    <ListPageTemplate
      title="Reports"
      subtitle="Print-ready on A4, with a CSV of every table"
      scrollPage
    >
      <div className={styles.index}>
        <Grid min="card" maxColumns={5}>
          <Card
            title="Evidence report"
            description="Each finding beside the page that proves it, with its basis and the audit trail."
          >
            <div className={styles.cardBody}>
              <Combobox
                label="Case"
                optional
                options={caseOptions}
                value={evCase}
                onValueChange={setEvCase}
              />
              <Combobox
                label="Client"
                optional
                options={clientOptions}
                value={evClient}
                onValueChange={setEvClient}
              />
              <TextField
                label="Received from"
                optional
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
              <TextField
                label="Received to"
                optional
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
              <Button
                variant="primary"
                icon={ProofIcon}
                disabled={!evCase && !evClient && !(from && to)}
                onClick={openEvidence}
              >
                Open evidence report
              </Button>
            </div>
          </Card>
          <Card
            title="Client statement"
            description="Open notices and what's due for one client, ready to send."
          >
            <div className={styles.cardBody}>
              <Combobox
                label="Client"
                options={clientOptions}
                value={stClient}
                onValueChange={setStClient}
              />
              <Button
                icon={UserIcon}
                disabled={!stClient}
                onClick={() => router.push(`/reports/statement?client=${stClient}`)}
              >
                Open statement
              </Button>
            </div>
          </Card>
          <Card
            title="Workload"
            description="Open items by person and by week, with what's overdue."
          >
            <div className={styles.cardBody}>
              <Button icon={UsersIcon} onClick={() => router.push("/reports/workload")}>
                Open workload
              </Button>
            </div>
          </Card>
          {canSeeExposure ? (
            <Card
              title="Exposure"
              description="Open demand, interest and penalty ranges per client and firm-wide, with the workings."
            >
              <div className={styles.cardBody}>
                <Button icon={ExposureIcon} onClick={() => router.push("/reports/exposure")}>
                  Open exposure report
                </Button>
              </div>
            </Card>
          ) : null}
          <Card
            title="Hearing pack"
            description="One printable bundle for a case: the notice, replies, documents, deadlines and evidence."
          >
            <div className={styles.cardBody}>
              <Combobox
                label="Case"
                options={caseOptions}
                value={packCase}
                onValueChange={setPackCase}
              />
              <Button
                icon={HearingPackIcon}
                disabled={!packCase}
                onClick={() => router.push(`/reports/hearing-pack?case=${packCase}`)}
              >
                Open hearing pack
              </Button>
            </div>
          </Card>
        </Grid>
      </div>
    </ListPageTemplate>
  );
}
