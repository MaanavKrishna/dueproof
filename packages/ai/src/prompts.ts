import { PROMPTS } from "./prompts.generated";
import type { Feature, Level } from "./types";

export type PromptId = keyof typeof PROMPTS;

export interface SystemPrompt {
  text: string;
  /** Stored in `ai_runs.prompt_version`, e.g. "extract.sonnet@2026-11-16.1". */
  version: string;
}

export function promptIdFor(feature: Feature, level: Level): PromptId {
  switch (feature) {
    case "extract":
      return `extract.${level}`;
    case "summary":
      return "summary";
    case "triage":
    case "client_match":
      return "triage";
    case "answer":
      return "answer";
    case "draft_reply":
      return "draft_reply";
  }
}

/**
 * The stable prefix: prompt text plus the org's profile vocabulary. Keep it
 * byte-identical between calls on the same level so the cache hits (no dates,
 * ids or per-document text in here).
 */
export function systemPrompt(
  feature: Feature,
  level: Level,
  vocabulary: readonly string[] = [],
): SystemPrompt {
  const p = PROMPTS[promptIdFor(feature, level)];
  const vocab =
    vocabulary.length > 0
      ? `\n## Vocabulary\n\nDesks and terms this organisation uses:\n${[...vocabulary]
          .map((v) => `- ${v.replace(/\s+/g, " ").trim()}`)
          .join("\n")}\n`
      : "";
  return { text: `${p.text}${vocab}`, version: `${p.id}@${p.version}` };
}
