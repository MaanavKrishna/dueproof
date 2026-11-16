/** Prints every text/background pair for every brand × mode; exits 1 if any fails AA. */
import { checkContrast } from "../src/contrast";

const results = checkContrast();
const failures = results.filter((r) => !r.pass);
const showAll = process.argv.includes("--all");

for (const r of showAll ? results : failures) {
  const flag = r.pass ? "ok  " : "FAIL";
  console.log(
    `${flag} ${r.brand.padEnd(17)} ${r.mode.padEnd(7)} ${r.fg.padEnd(24)} on ${r.bg.padEnd(22)} ${r.ratio.toFixed(2).padStart(5)} (min ${r.min})`,
  );
}
console.log(`${results.length - failures.length}/${results.length} pairs pass AA.`);
process.exit(failures.length ? 1 : 0);
