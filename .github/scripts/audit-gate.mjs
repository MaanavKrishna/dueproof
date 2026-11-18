// Decide whether a dependency audit passes, given .github/audit-allowlist.json.
//
//   node .github/scripts/audit-gate.mjs npm    pnpm-audit.json
//   node .github/scripts/audit-gate.mjs python pip-audit.json
//   node .github/scripts/audit-gate.mjs cargo  cargo-audit.json
//
// Fails on any advisory that is not on the allowlist (npm: high or critical
// only; Python and Rust: every vulnerability, since neither database grades
// them consistently), and on any allowlist entry past its re-check date.
// Allowlisted advisories are printed, so the log shows what is accepted.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [kind, file] = process.argv.slice(2);
if (!["npm", "python", "cargo"].includes(kind) || !file) {
  console.error("usage: audit-gate.mjs npm|python|cargo <report.json>");
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const allowlist = JSON.parse(readFileSync(join(here, "..", "audit-allowlist.json"), "utf8"));
const report = JSON.parse(readFileSync(file, "utf8"));
const today = new Date().toISOString().slice(0, 10);

// A report without its expected shape means the audit itself failed (no
// network, a tool error): never read that as "nothing found".
const shapeOk =
  kind === "npm"
    ? report.advisories && report.metadata
    : kind === "python"
      ? Array.isArray(report.dependencies)
      : report.vulnerabilities;
if (!shapeOk) {
  console.log(`::error::The ${kind} audit did not produce a report: ${JSON.stringify(report).slice(0, 300)}`);
  process.exit(1);
}

/** @type {{id: string, aliases: string[], pkg: string, version: string, severity: string}[]} */
const found = [];
if (kind === "npm") {
  for (const a of Object.values(report.advisories ?? {})) {
    if (!["high", "critical"].includes(a.severity)) continue;
    const versions = [...new Set((a.findings ?? []).map((f) => f.version))].join(", ");
    found.push({
      id: a.github_advisory_id,
      aliases: a.cves ?? [],
      pkg: a.module_name,
      version: versions,
      severity: a.severity,
    });
  }
} else if (kind === "python") {
  for (const d of report.dependencies ?? []) {
    for (const v of d.vulns ?? []) {
      found.push({ id: v.id, aliases: v.aliases ?? [], pkg: d.name, version: d.version, severity: "unrated" });
    }
  }
} else {
  for (const v of report.vulnerabilities?.list ?? []) {
    found.push({
      id: v.advisory.id,
      aliases: v.advisory.aliases ?? [],
      pkg: v.package.name,
      version: v.package.version,
      severity: v.advisory.cvss ?? "unrated",
    });
  }
}

const entries = allowlist[kind] ?? [];
let failed = false;

for (const e of entries) {
  if (!e.reason || !e.recheck) {
    console.log(`::error::Allowlist entry ${e.id} needs a reason and a re-check date`);
    failed = true;
  } else if (e.recheck < today) {
    console.log(`::error::Allowlist entry ${e.id} (${e.package}) was due for a re-check on ${e.recheck}`);
    failed = true;
  }
}

for (const f of found) {
  const entry = entries.find((e) => e.id === f.id || f.aliases.includes(e.id));
  const what = `${f.id} ${f.severity} in ${f.pkg} ${f.version}`;
  if (entry) {
    console.log(`accepted: ${what} (re-check by ${entry.recheck}): ${entry.reason}`);
  } else {
    console.log(`::error::New advisory: ${what}`);
    failed = true;
  }
}

for (const e of entries) {
  if (!found.some((f) => f.id === e.id || f.aliases.includes(e.id))) {
    console.log(`::notice::Allowlist entry ${e.id} (${e.package}) no longer matches anything; remove it`);
  }
}

console.log(`${kind}: ${found.length} advisories at the gated level, ${entries.length} allowlisted`);
process.exit(failed ? 1 : 0);
