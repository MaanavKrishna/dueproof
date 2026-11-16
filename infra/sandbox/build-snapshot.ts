/**
 * Build the engine-heavy Vercel Sandbox snapshot (03 §3a).
 *
 * Starts a Sandbox, installs Python 3.13, the engine's `heavy` dependency
 * group (CPU torch, IndicTrans2's toolkit, OpenCV, pytesseract), the
 * Tesseract binary with Indian-language packs, the PaddleOCR models and,
 * optionally, the IndicTrans2 weights from R2; checks that the engine
 * imports and reports its rungs; then snapshots the microVM. The app
 * (apps/app/lib/heavy-engine.ts) starts every engine-heavy job from that
 * snapshot, with storage-only network, so no job installs anything.
 *
 *   cd infra/sandbox
 *   vercel link            # to the dueproof-app project (Sandbox usage is billed there)
 *   vercel env pull        # VERCEL_OIDC_TOKEN, valid 12 hours
 *   pnpm build-snapshot    # or: node build-snapshot.ts --dry-run
 *
 * Environment:
 *   VERCEL_OIDC_TOKEN, or VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID
 *   HEAVY_ENGINE_REGION       default bom1 (verify Sandbox availability there in M0)
 *   HEAVY_SNAPSHOT_IMAGE      default vercel/sandbox/python:3.14 (must have apt)
 *   OCR_LANGS                 Tesseract packs, default: the Indian scripts below
 *   INDICTRANS2_WEIGHTS_URL   optional: a short-lived signed GET URL for a .tar.gz of
 *                             the weights folder (made by `python -m dueproof_engine.tools.model`),
 *                             stored in R2. Never printed.
 *
 * Prints the snapshot id: set it as HEAVY_ENGINE_SNAPSHOT_ID on the app project.
 * Rebuild when the engine's heavy dependencies or models change, and on a
 * schedule for security updates (snapshot lifetime: verify in M0).
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** Where things go in the microVM. Keep in step with SNAPSHOT_LAYOUT in apps/app/lib/heavy-engine.ts. */
export const LAYOUT = {
  engineRoot: "/opt/dueproof-engine",
  venv: "/opt/engine",
  python: "/opt/engine/bin/python",
  pythons: "/opt/python",
  models: "/opt/models",
} as const;

const DEFAULT_OCR_LANGS = [
  "eng", "hin", "mar", "nep", "san", "ben", "asm", "guj", "pan", "ori",
  "tam", "tel", "kan", "mal", "urd",
];

const ENGINE_DIR = fileURLToPath(new URL("../../services/engine/", import.meta.url));

export interface Step {
  name: string;
  /** Run with bash -lc, as root. */
  script: string;
  /** Extra environment for this step (values may be secret: never logged). */
  env?: Record<string, string>;
}

export function steps(opts: { ocrLangs: string[]; weightsUrl?: string | undefined }): Step[] {
  const packs = opts.ocrLangs.map((l) => `tesseract-ocr-${l}`).join(" ");
  const uvEnv = {
    UV_PYTHON_INSTALL_DIR: LAYOUT.pythons,
    UV_PROJECT_ENVIRONMENT: LAYOUT.venv,
    UV_LINK_MODE: "copy",
    UV_COMPILE_BYTECODE: "1",
  };
  const list: Step[] = [
    {
      name: "system packages (Tesseract + language packs)",
      script: [
        "set -euo pipefail",
        "if ! command -v apt-get >/dev/null; then echo 'this image has no apt-get: set HEAVY_SNAPSHOT_IMAGE to an Ubuntu-based image' >&2; exit 3; fi",
        "export DEBIAN_FRONTEND=noninteractive",
        "apt-get update -q",
        `apt-get install -y -q --no-install-recommends ca-certificates curl tesseract-ocr ${packs}`,
        "rm -rf /var/lib/apt/lists/*",
        "tesseract --version | head -1",
      ].join("\n"),
    },
    {
      name: "uv and Python 3.13",
      script: [
        "set -euo pipefail",
        "command -v uv >/dev/null || python3 -m pip install --quiet --break-system-packages uv || (curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh)",
        "uv --version",
        "uv python install 3.13",
        `uv venv --python 3.13 ${LAYOUT.venv}`,
      ].join("\n"),
      env: uvEnv,
    },
    {
      name: "engine dependencies (heavy group, CPU torch)",
      script: [
        "set -euo pipefail",
        `cd ${LAYOUT.engineRoot}`,
        // CPU torch first, so the heavy group doesn't pull the CUDA build.
        `uv pip install --python ${LAYOUT.python} torch --index-url https://download.pytorch.org/whl/cpu`,
        "uv sync --frozen --no-install-project --no-default-groups --group heavy --inexact",
      ].join("\n"),
      env: uvEnv,
    },
    {
      name: "PaddleOCR models (pinned SHA-256)",
      script: `set -euo pipefail\ncd ${LAYOUT.engineRoot}\n${LAYOUT.python} scripts/fetch_ocr_models.py --dest ${LAYOUT.models}/ppocr`,
    },
  ];
  if (opts.weightsUrl) {
    list.push({
      name: "IndicTrans2 weights (from R2)",
      script: [
        "set -euo pipefail",
        `mkdir -p ${LAYOUT.models}/indictrans2`,
        `curl -fsSL "$WEIGHTS_URL" | tar -xz -C ${LAYOUT.models}/indictrans2`,
        `du -sh ${LAYOUT.models}/indictrans2`,
      ].join("\n"),
      env: { WEIGHTS_URL: opts.weightsUrl },
    });
  }
  list.push(
    {
      name: "permissions",
      script: `chmod -R a+rX ${LAYOUT.engineRoot} ${LAYOUT.venv} ${LAYOUT.pythons} ${LAYOUT.models}`,
    },
    {
      name: "smoke test (engine imports, rungs)",
      script: [
        "set -euo pipefail",
        `cd ${LAYOUT.engineRoot}`,
        `PYTHONPATH=${LAYOUT.engineRoot} DUEPROOF_MODELS=${LAYOUT.models} ENGINE_SHARED_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \\n') \\`,
        `  ${LAYOUT.python} -c "from fastapi.testclient import TestClient; from dueproof_engine.app import app; print(TestClient(app).get('/health').json())"`,
      ].join("\n"),
    },
  );
  return list;
}

/** The engine's source files for the snapshot: package metadata, code and the model fetcher. */
async function engineFiles(): Promise<{ path: string; content: Uint8Array }[]> {
  const out: { path: string; content: Uint8Array }[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "__pycache__") await walk(full);
      } else if (!entry.name.endsWith(".pyc")) {
        out.push({ path: relative(ENGINE_DIR, full), content: await readFile(full) });
      }
    }
  }
  for (const f of ["pyproject.toml", "uv.lock", "scripts/fetch_ocr_models.py"]) {
    out.push({ path: f, content: await readFile(join(ENGINE_DIR, f)) });
  }
  await walk(join(ENGINE_DIR, "dueproof_engine"));
  return out;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const region = process.env.HEAVY_ENGINE_REGION || "bom1";
  const image = process.env.HEAVY_SNAPSHOT_IMAGE || "vercel/sandbox/python:3.14";
  const ocrLangs = process.env.OCR_LANGS?.split(/[\s,]+/).filter(Boolean) ?? DEFAULT_OCR_LANGS;
  const plan = steps({ ocrLangs, weightsUrl: process.env.INDICTRANS2_WEIGHTS_URL });
  const files = await engineFiles();

  console.log(`engine-heavy snapshot: image ${image}, region ${region}`);
  console.log(`engine files: ${files.length}; Tesseract packs: ${ocrLangs.join(" ")}`);
  if (dryRun) {
    for (const s of plan) console.log(`\n## ${s.name}\n${s.script}`);
    return;
  }

  const { Sandbox } = await import("@vercel/sandbox");
  const t0 = Date.now();
  const sandbox = await Sandbox.create({
    image,
    region,
    resources: { vcpus: 4 },
    // Installing torch and the packs takes a while; 45 minutes is also the Hobby cap.
    timeout: 45 * 60 * 1000,
    // Build time only: PyPI, apt, the PyTorch index and R2. Jobs run deny-all-but-storage.
    networkPolicy: "allow-all",
    tags: { app: "dueproof", part: "engine-heavy-build" },
  });
  console.log(`sandbox ${sandbox.name} started in ${Math.round((Date.now() - t0) / 1000)} s`);

  let snapshotted = false;
  try {
    const staging = "/tmp/dueproof-engine-src";
    await sandbox.writeFiles(files.map((f) => ({ path: `${staging}/${f.path}`, content: f.content })));
    const copy = await sandbox.runCommand({
      cmd: "bash",
      args: ["-lc", `rm -rf ${LAYOUT.engineRoot} && mkdir -p /opt && cp -r ${staging} ${LAYOUT.engineRoot}`],
      sudo: true,
    });
    if (copy.exitCode !== 0) throw new Error("copying the engine source failed");

    for (const step of plan) {
      const t = Date.now();
      process.stdout.write(`\n## ${step.name}\n`);
      const res = await sandbox.runCommand({
        cmd: "bash",
        args: ["-lc", step.script],
        sudo: true,
        ...(step.env ? { env: step.env } : {}),
        stdout: process.stdout,
        stderr: process.stderr,
      });
      if (res.exitCode !== 0) throw new Error(`step failed (${res.exitCode}): ${step.name}`);
      console.log(`-- ${step.name}: ${Math.round((Date.now() - t) / 1000)} s`);
    }

    // Snapshotting stops the sandbox. No expiry: the app pins this id.
    const snapshot = await sandbox.snapshot({ expiration: 0 });
    snapshotted = true;
    console.log(`\nsnapshot ${snapshot.snapshotId} (${Math.round(snapshot.sizeBytes / 1e6)} MB)`);
    console.log(`Set HEAVY_ENGINE_SNAPSHOT_ID=${snapshot.snapshotId} on the dueproof-app project.`);
  } finally {
    if (!snapshotted) await sandbox.stop().catch(() => {});
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
