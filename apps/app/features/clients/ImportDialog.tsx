"use client";
/**
 * Import clients: choose a CSV (or paste rows copied from Excel), map the
 * columns, see what's wrong line by line, then import the good rows.
 */
import {
  Banner,
  Button,
  Dialog,
  FileDropZone,
  InsetGroupedList,
  ListRow,
  Select,
  TextArea,
} from "@dueproof/ui";
import { useMemo, useState } from "react";
import { plural } from "@/lib/plural";
import { importClients } from "./actions";
import styles from "./clients.module.css";
import {
  FIELD_LABEL,
  guessMapping,
  IMPORT_FIELDS,
  type ImportField,
  type Mapping,
  parseDelimited,
  validateImport,
} from "./csv-import";

export function ImportDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const table = useMemo(() => (text ? parseDelimited(text) : []), [text]);
  const headers = table[0] ?? [];
  const preview = useMemo(
    () => (mapping && table.length > 1 ? validateImport(table.slice(1), mapping) : null),
    [mapping, table],
  );

  function load(next: string) {
    setText(next);
    setResult(null);
    const rows = parseDelimited(next);
    setMapping(rows[0] ? guessMapping(rows[0]) : null);
  }

  async function run() {
    if (!mapping) return;
    setBusy(true);
    setError(null);
    const res = await importClients(text, mapping);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    const r = res.data;
    setResult(
      `${r.created} added, ${r.existing} already here, ${r.skipped} with problems. ${r.statutory} statutory deadlines created.`,
    );
    onDone();
  }

  const columnOptions = [
    { value: "-1", label: "Not in the file" },
    ...headers.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` })),
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Import clients"
      description="A CSV from Tally or Zoho, or rows copied from a spreadsheet. GSTINs and PANs are checked before anything is saved."
      size="lg"
    >
      <div className={styles.form}>
        {!text ? (
          <>
            <FileDropZone
              accept=".csv,.tsv,.txt,text/csv,text/plain"
              maxSize={5 * 1024 * 1024}
              title="Drop a CSV file"
              onFiles={async (files) => {
                const f = files[0];
                if (f) load(await f.text());
              }}
            />
            <TextArea
              label="Or paste rows (with a header row)"
              rows={4}
              onChange={(e) => load(e.target.value)}
            />
          </>
        ) : null}
        {mapping ? (
          <InsetGroupedList header="Columns" footer="Only the client name is needed.">
            {IMPORT_FIELDS.map((f: ImportField) => (
              <ListRow
                key={f}
                label={FIELD_LABEL[f]}
                control={
                  <Select
                    label={FIELD_LABEL[f]}
                    hideLabel
                    size="sm"
                    value={String(mapping[f])}
                    onValueChange={(v) => setMapping({ ...mapping, [f]: Number(v) })}
                    options={columnOptions}
                  />
                }
              />
            ))}
          </InsetGroupedList>
        ) : null}
        {preview ? (
          <Banner
            tone={preview.issues.length ? "warning" : "success"}
            title={`${plural(preview.rows.length, "row")} ready · ${preview.skipped} with problems`}
          >
            {preview.issues.length ? (
              <ul className={styles.issues}>
                {preview.issues.slice(0, 12).map((i) => (
                  <li key={`${i.line}-${i.field}-${i.message}`}>
                    Line {i.line}, {FIELD_LABEL[i.field]}: {i.message}
                  </li>
                ))}
                {preview.issues.length > 12 ? <li>and {preview.issues.length - 12} more</li> : null}
              </ul>
            ) : (
              "Every row checks out."
            )}
          </Banner>
        ) : null}
        {result ? (
          <Banner tone="success" title="Imported">
            {result}
          </Banner>
        ) : null}
        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
        <div className={styles.formActions}>
          {text ? (
            <Button variant="plain" onClick={() => load("")}>
              Choose another file
            </Button>
          ) : null}
          <Button
            variant="primary"
            loading={busy}
            disabled={!preview?.rows.length || Boolean(result)}
            onClick={run}
          >
            Import {plural(preview?.rows.length ?? 0, "client")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
