/**
 * The AI eval (04 §8).
 *
 *   pnpm --filter @dueproof/ai eval                          # recorded mode, all routes
 *   pnpm --filter @dueproof/ai eval -- --route routed,sonnet # some routes
 *   pnpm --filter @dueproof/ai eval -- --case notice-gst-asmt10
 *   ANTHROPIC_API_KEY=… pnpm --filter @dueproof/ai eval -- --mode live [--record]
 *
 * Writes evals/reports/<mode>-latest.{json,md} and exits 1 if any route other
 * than `rules` fails the gate (confident-wrong must be 0).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EVALS_DIR, loadCases } from "./lib/cases";
import { renderMarkdown } from "./lib/report";
import { type Mode, ROUTES, type RouteName, runEval } from "./lib/runner";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const mode = (arg("mode") ?? "recorded") as Mode;
if (mode !== "recorded" && mode !== "live") {
  console.error("--mode must be recorded or live");
  process.exit(2);
}
const routes = (arg("route")?.split(",") ?? [...ROUTES]) as RouteName[];
for (const r of routes) {
  if (!ROUTES.includes(r)) {
    console.error(`unknown route ${r}; one of ${ROUTES.join(", ")}`);
    process.exit(2);
  }
}
const only = arg("case")?.split(",");
const apiKey = process.env.ANTHROPIC_API_KEY;
if (mode === "live" && !apiKey) {
  console.error("live mode needs ANTHROPIC_API_KEY");
  process.exit(2);
}

const report = await runEval({
  mode,
  routes,
  cases: loadCases(only),
  record: process.argv.includes("--record"),
  ...(apiKey ? { apiKey } : {}),
});

const outDir = join(EVALS_DIR, "reports");
mkdirSync(outDir, { recursive: true });
const md = renderMarkdown(report);
writeFileSync(join(outDir, `${mode}-latest.json`), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(join(outDir, `${mode}-latest.md`), md);
console.log(md);

const failed = report.routes.filter((r) => r.route !== "rules" && !r.passes);
if (failed.length > 0) {
  console.error(`gate failed: ${failed.map((r) => r.route).join(", ")} (confident-wrong must be 0)`);
  process.exit(1);
}
