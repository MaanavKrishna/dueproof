// The self-hosted scheduler for Dueproof's daily run (the morning digest,
// notifications and escalation). Runs in the `daily` service, from the app
// image, on the internal network only. Every day at DAILY_AT (in TZ) it
// calls GET http://app:3000/api/cron/daily with the CRON_SECRET bearer.
//
// The run is idempotent (nothing is sent twice in a day), so after a
// restart past DAILY_AT it catches up at once, and a failed call is retried
// every 10 minutes for two hours. Logs carry status codes and counts only:
// never the secret.
//
//   node daily.mjs            schedule (the service's command)
//   node daily.mjs now        one run, then exit (0 = ok)

const URL_ = process.env.DAILY_URL || "http://app:3000/api/cron/daily";
const SECRET = process.env.CRON_SECRET || "";
const AT = process.env.DAILY_AT || "07:00";
const RETRY_MS = 10 * 60 * 1000;
const RETRIES = 12;

const log = (msg) => console.log(`${new Date().toISOString()} daily: ${msg}`);

/** Today's HH:MM in the process time zone (TZ). */
export function todayAt(at, now = new Date()) {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(at);
  if (!m) throw new Error(`DAILY_AT must look like 07:00, not ${JSON.stringify(at)}`);
  const t = new Date(now);
  t.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return t;
}

/** Milliseconds from `now` until the next HH:MM. */
export function msUntil(at, now = new Date()) {
  const next = todayAt(at, now);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

async function runOnce() {
  try {
    const res = await fetch(URL_, {
      headers: { authorization: `Bearer ${SECRET}` },
      signal: AbortSignal.timeout(5 * 60 * 1000),
    });
    if (!res.ok) {
      log(`the app answered ${res.status}`);
      return false;
    }
    const r = await res.json().catch(() => ({}));
    log(
      `done: ${r.orgs ?? "?"} organisations, ${r.notifications ?? "?"} notifications, ` +
        `${r.escalations ?? "?"} escalations, ${r.digests ?? "?"} digests`,
    );
    return true;
  } catch (e) {
    log(`couldn't reach the app (${e instanceof Error ? e.name : "error"})`);
    return false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runWithRetries() {
  for (let i = 0; i <= RETRIES; i++) {
    if (await runOnce()) return;
    if (i < RETRIES) await sleep(RETRY_MS);
  }
  log("giving up until tomorrow");
}

async function main() {
  if (SECRET.length < 32) {
    log("CRON_SECRET is not set (or shorter than 32 characters); the daily run is off");
    if (process.argv[2] === "now") process.exit(1);
    setInterval(() => {}, 2 ** 30); // stay up quietly rather than restart in a loop
    return;
  }
  if (process.argv[2] === "now") process.exit((await runOnce()) ? 0 : 1);
  log(`every day at ${AT} (${process.env.TZ || "UTC"})`);
  // Started after today's time (a restart, an upgrade): catch up now. The
  // run is idempotent, so a day already done sends nothing new.
  if (new Date() >= todayAt(AT)) {
    await sleep(60_000); // let the app finish starting
    await runWithRetries();
  }
  for (;;) {
    await sleep(msUntil(AT));
    await runWithRetries();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
