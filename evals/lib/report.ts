import type { EvalReport } from "./runner";
import { ROUTE_DESCRIPTIONS, type RouteName } from "./runner";

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(0)} %`);
const usd = (micro: number) => `$${(micro / 1_000_000).toFixed(4)}`;

export function renderMarkdown(r: EvalReport): string {
  const lines: string[] = [];
  lines.push(`# Dueproof AI eval (${r.mode})`, "");
  lines.push(`Generated ${r.generatedAt}. Cases: ${r.cases.join(", ")}.`, "");
  lines.push(
    "| Route | Precision | Recall | Deadline exact | Amount exact | Located | Confident-wrong | AI calls | Cost / notice | Mean latency | Gate |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
  );
  for (const s of r.routes) {
    lines.push(
      `| ${s.route} | ${pct(s.precision)} | ${pct(s.recall)} | ${pct(s.deadlineExact)} | ${pct(s.amountExact)} | ${pct(s.locatedRate)} | ${s.confidentWrong} | ${s.aiCalls} | ${usd(s.costPerNoticeMicroUsd)} | ${(s.latencyMeanMs / 1000).toFixed(1)} s | ${s.passes ? "pass" : "**fail**"} |`,
    );
  }
  lines.push("", "Routes:", "");
  for (const s of r.routes) lines.push(`- **${s.route}**: ${ROUTE_DESCRIPTIONS[s.route as RouteName] ?? ""}`);
  lines.push("", "## Per case", "");
  for (const [route, scores] of Object.entries(r.perCase)) {
    lines.push(`### ${route}`, "", "| Case | Tags | Found | Predicted (matched) | Deadlines exact | Located | Calls | Escalations | Confident-wrong |", "|---|---|---|---|---|---|---|---|---|");
    for (const s of scores) {
      lines.push(
        `| ${s.key} | ${s.tags.join(", ")} | ${s.found}/${s.labels} | ${s.predicted} (${s.predictedMatched}) | ${s.deadlineExact}/${s.deadlineLabels} | ${s.aiFindings ? `${s.aiLocated}/${s.aiFindings}` : "—"} | ${s.calls} | ${s.escalations.join(", ") || "—"} | ${s.confidentWrong.map((c) => `${c.why}: “${c.quote}” ${c.computed ?? ""}${c.expected ? ` (expected ${c.expected})` : ""}`).join("; ") || "0"} |`,
      );
    }
    lines.push("");
  }
  lines.push("## Notes", "", ...r.notes.map((n) => `- ${n}`), "");
  return lines.join("\n");
}
