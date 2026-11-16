/**
 * Issue a Dueproof Business licence, offline, on the owner's machine (08 §5).
 *
 *   # once: make a signing key pair (keep the private key offline; never commit it)
 *   pnpm --filter @dueproof/ee licence keygen --out ~/dueproof-licence-keys --id dueproof-2027
 *
 *   # per customer
 *   pnpm --filter @dueproof/ee licence issue \
 *     --key ~/dueproof-licence-keys/dueproof-2027.private.pem --key-id dueproof-2027 \
 *     --licensee "Sharma & Co" --org "Sharma & Co Chartered Accountants" \
 *     --features sso,audit-export,white-label --seats 25 --days 365 \
 *     --out sharma-and-co.dueproof-licence
 *
 *   # check a file against the keys this build trusts (or a given public key)
 *   pnpm --filter @dueproof/ee licence verify --file sharma-and-co.dueproof-licence [--public-key k.pem]
 *
 * The private key is read from a file path you give; this script never
 * stores, prints or sends it. There is no server: licences are emailed by hand.
 */
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { BUSINESS_FEATURES, isBusinessFeature } from "@dueproof/plugins";
import { type TrustedKey, trustedKeys } from "../licence/keys";
import { evaluateLicence, issueLicence, parseLicenceFile } from "../licence/licence";

const [command, ...rest] = process.argv.slice(2);

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function keygen(): void {
  const { values } = parseArgs({
    args: rest,
    options: { out: { type: "string" }, id: { type: "string" } },
  });
  if (!values.out || !values.id) fail("keygen needs --out <dir> and --id <key id>");
  const dir = resolve(values.out);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const priv = join(dir, `${values.id}.private.pem`);
  const pub = join(dir, `${values.id}.public.pem`);
  if (existsSync(priv)) fail(`${priv} already exists; not overwriting a signing key.`);
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  writeFileSync(priv, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  writeFileSync(pub, publicKey.export({ type: "spki", format: "pem" }));
  process.stdout.write(
    `Wrote ${pub}\nWrote ${priv} (mode 600). Move it to your hardware key; never commit it.\n` +
      `Paste the public key into ee/licence/keys.ts as { id: "${values.id}", publicKey: … }.\n`,
  );
}

function issue(): void {
  const { values } = parseArgs({
    args: rest,
    options: {
      key: { type: "string" },
      "key-id": { type: "string" },
      licensee: { type: "string" },
      org: { type: "string" },
      features: { type: "string" },
      seats: { type: "string" },
      days: { type: "string", default: "365" },
      "issued-at": { type: "string" },
      "licence-id": { type: "string" },
      out: { type: "string" },
    },
  });
  if (!values.key || !values["key-id"] || !values.licensee || !values.org || !values.features)
    fail("issue needs --key, --key-id, --licensee, --org and --features");
  const features = values.features
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  const unknown = features.filter((f) => !isBusinessFeature(f));
  if (unknown.length > 0)
    fail(`Unknown feature(s): ${unknown.join(", ")}. Known: ${BUSINESS_FEATURES.join(", ")}`);
  const issuedAt = values["issued-at"] ? new Date(values["issued-at"]) : new Date();
  const days = Number(values.days);
  if (!Number.isInteger(days) || days < 1 || days > 3 * 366) fail("--days must be 1 to 1098");
  const expiresAt = new Date(issuedAt.getTime() + days * 24 * 60 * 60 * 1000);
  const seats = values.seats ? Number(values.seats) : null;
  if (seats !== null && (!Number.isInteger(seats) || seats < 1)) fail("--seats must be a number");
  const { file } = issueLicence(
    {
      v: 1,
      licenceId: values["licence-id"] ?? `lic_${randomBytes(9).toString("base64url")}`,
      licensee: values.licensee,
      orgName: values.org,
      features,
      seats,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    },
    readFileSync(resolve(values.key), "utf8"),
    values["key-id"],
  );
  if (values.out) {
    writeFileSync(resolve(values.out), file);
    process.stdout.write(`Wrote ${resolve(values.out)} (expires ${expiresAt.toISOString()})\n`);
  } else {
    process.stdout.write(file);
  }
}

function verifyFile(): void {
  const { values } = parseArgs({
    args: rest,
    options: { file: { type: "string" }, "public-key": { type: "string" } },
  });
  if (!values.file) fail("verify needs --file");
  const stored = parseLicenceFile(readFileSync(resolve(values.file), "utf8"));
  const keys: TrustedKey[] = values["public-key"]
    ? [{ id: "given", publicKey: readFileSync(resolve(values["public-key"]), "utf8") }]
    : trustedKeys();
  const status = evaluateLicence(stored, { now: new Date(), keys });
  process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
  if (status.state === "invalid") process.exit(2);
}

switch (command) {
  case "keygen":
    keygen();
    break;
  case "issue":
    issue();
    break;
  case "verify":
    verifyFile();
    break;
  default:
    fail("Usage: licence keygen | issue | verify  (see the comment at the top of this file)");
}
