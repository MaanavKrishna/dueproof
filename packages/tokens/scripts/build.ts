/** Writes src/generated/tokens.css and src/generated/vars.ts from the token source. */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildCss, buildVarsTs } from "../src/build";

const out = (name: string) => fileURLToPath(new URL(`../src/generated/${name}`, import.meta.url));

writeFileSync(out("tokens.css"), buildCss());
writeFileSync(out("vars.ts"), buildVarsTs());
try {
  execFileSync("biome", ["format", "--write", out("tokens.css"), out("vars.ts")], { stdio: "ignore" });
} catch {
  // Formatting is cosmetic; the staleness test ignores layout.
}
console.log("tokens: wrote src/generated/tokens.css and src/generated/vars.ts");
