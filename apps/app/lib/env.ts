/**
 * Server environment, validated with Zod once at boot (instrumentation.ts)
 * and on first use. Nothing here is NEXT_PUBLIC_: no secret reaches the
 * browser (05 §3).
 */
import { createHmac } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const bool = z
  .enum(["1", "0", "true", "false", "yes", "no"])
  .transform((v) => v === "1" || v === "true" || v === "yes");

const secret = z.string().min(32, "must be at least 32 characters");

const Env = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    /** Which edition this install is. Drives defaults below. */
    DUEPROOF_EDITION: z.enum(["self-hosted", "hosted", "desktop"]).default("self-hosted"),
    /** Public origin of the app, as browsers reach it. */
    APP_URL: z.string().url().default("http://localhost:3000"),

    AUTH_SECRET: secret,
    /** first-user: first sign-up owns the org, then invitations only. open: anyone (hosted). */
    AUTH_SIGNUP: z.enum(["first-user", "open"]).optional(),
    /** Extra origins allowed to call /api/auth (comma separated), e.g. the desktop shell. */
    AUTH_TRUSTED_ORIGINS: z.string().optional(),
    /** Header our own proxy sets with the client IP (Caddy: x-forwarded-for; Vercel: x-real-ip). */
    AUTH_IP_HEADER: z.string().optional(),

    DATABASE_DRIVER: z.enum(["pglite", "postgres", "neon"]).optional(),
    DATABASE_URL: z.string().optional(),
    // Outside the repository by default: Turbopack watches the repo, and a
    // database or file write inside it makes `next dev` reload every page.
    PGLITE_DATA_DIR: z.string().default(join(homedir(), ".dueproof", "dev", "pglite")),
    DB_MIGRATE_ON_START: bool.default(true),

    STORAGE_DRIVER: z.enum(["local", "s3", "vercel-blob"]).default("local"),
    STORAGE_LOCAL_DIR: z.string().default(join(homedir(), ".dueproof", "dev", "files")),
    /** HMAC key for local signed URLs. Defaults to one derived from AUTH_SECRET. */
    STORAGE_SIGNING_SECRET: secret.optional(),
    /** Base URL the engine uses to reach local signed URLs (e.g. http://app:3000 in Compose). */
    STORAGE_ENGINE_BASE_URL: z.string().url().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ENDPOINT: z.string().url().optional(),
    S3_REGION: z.string().default("auto"),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: bool.default(false),
    BLOB_READ_WRITE_TOKEN: z.string().optional(),

    /** http: call services/engine. fake: in-process recordings (dev and tests). */
    ENGINE_MODE: z.enum(["http", "fake"]).optional(),
    ENGINE_URL: z.string().url().optional(),
    ENGINE_SHARED_SECRET: secret.optional(),
    /** Highest OCR rung the engine may use here (engine-fast stops at paddleocr). */
    ENGINE_MAX_RUNG: z
      .enum(["text_layer", "paddleocr", "tesseract", "vision", "none"])
      .default("tesseract"),

    /** Per-file upload cap in bytes (05 §3a: 50 MB). */
    UPLOAD_MAX_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(50 * 1024 * 1024),

    /**
     * engine-heavy in Vercel Sandbox (hosted only, 03 §3a): the snapshot made by
     * infra/sandbox/build-snapshot.ts. Unset = no escalation; pages engine-fast
     * can't read go to the AI step or a person, and translation is skipped.
     */
    HEAVY_ENGINE_SNAPSHOT_ID: z.string().optional(),
    HEAVY_ENGINE_REGION: z.string().default("bom1"),
    HEAVY_ENGINE_VCPUS: z.coerce.number().int().min(1).max(32).default(4),
    /** Sandbox lifetime cap for one batch (ms). */
    HEAVY_ENGINE_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60 * 1000),
    /** Hosts the Sandbox may reach (comma separated). Default: the storage host only. */
    HEAVY_ENGINE_ALLOWED_HOSTS: z.string().optional(),

    /**
     * AI (04 §5, §7). AI_KEY_MASTER wraps each organisation's BYOK key
     * (32 bytes, base64; `openssl rand -base64 32`). Without it a BYOK key
     * can't be saved or used. ANTHROPIC_API_KEY is Dueproof's own Claude
     * API key for the AI plan (hosted only); AI_GATEWAY_API_KEY is an optional
     * alternative plan path through Vercel AI Gateway.
     */
    AI_KEY_MASTER: z
      .string()
      .refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes, base64-encoded")
      .optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    AI_GATEWAY_API_KEY: z.string().optional(),

    /** Bearer token for GET /api/metrics from outside the machine. Unset: local requests only. */
    METRICS_TOKEN: secret.optional(),
    /** Postgres-backed rate limits (05 §3a). */
    RATE_LIMIT_ENABLED: bool.default(true),
    /** Overrides, e.g. "upload.user=100/1h,search.user=60/1m" (see lib/rate-limit.ts). */
    RATE_LIMITS: z.string().optional(),
    /** Version reported by /api/health and /api/metrics (set by the image build). */
    DUEPROOF_VERSION: z.string().default("0.1.0"),
    /**
     * Self-hosted: the backup container's `last.json`, mounted read-only into
     * the app, so Settings → System can show the last backup. Unset: "unknown".
     */
    BACKUP_STATUS_FILE: z.string().optional(),

    /**
     * Web Push (03 §5): this install's own VAPID key pair (base64url, P-256).
     * Unset: a pair is derived from AUTH_SECRET, so it is stable per install
     * without extra setup. PUSH_ENABLED=0 switches Web Push off for the
     * whole install (the email digest then covers the need).
     */
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    /** Contact for push services: "mailto:admin@example.com" or the app URL. */
    VAPID_SUBJECT: z.string().optional(),
    PUSH_ENABLED: bool.default(true),

    /** Outbound mail for the morning digest: smtp (self-hosted), resend (hosted), log (stub). */
    MAIL_DRIVER: z.enum(["smtp", "resend", "log"]).optional(),
    /** smtp://user:pass@host:587 */
    SMTP_URL: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    MAIL_FROM: z.string().default("Dueproof <no-reply@dueproof.local>"),

    /**
     * Reports without "Prepared with Dueproof". Normally the Business licence
     * switches this on (white-label feature); the flag is a development override.
     */
    REPORT_WHITE_LABEL: bool.default(false),

    /** Bearer secret for GET /api/cron/daily (Vercel Cron sends it as CRON_SECRET). */
    CRON_SECRET: secret.optional(),

    /** Bare pages under /dev that exercise sign-in and upload. On by default outside production. */
    DUEPROOF_DEV_PAGES: bool.optional(),
  })
  .superRefine((env, ctx) => {
    const driver = env.DATABASE_DRIVER ?? (env.DATABASE_URL ? "postgres" : "pglite");
    if (driver !== "pglite" && !env.DATABASE_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: `required for DATABASE_DRIVER=${driver}`,
      });
    }
    if (env.STORAGE_DRIVER === "s3") {
      for (const k of ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
        if (!env[k])
          ctx.addIssue({ code: "custom", path: [k], message: "required for STORAGE_DRIVER=s3" });
      }
    }
    if (env.STORAGE_DRIVER === "vercel-blob" && !env.BLOB_READ_WRITE_TOKEN) {
      ctx.addIssue({
        code: "custom",
        path: ["BLOB_READ_WRITE_TOKEN"],
        message: "required for vercel-blob",
      });
    }
    if (env.HEAVY_ENGINE_SNAPSHOT_ID && env.STORAGE_DRIVER === "local") {
      ctx.addIssue({
        code: "custom",
        path: ["HEAVY_ENGINE_SNAPSHOT_ID"],
        message: "engine-heavy needs object storage it can reach (STORAGE_DRIVER=s3)",
      });
    }
    const engineMode = env.ENGINE_MODE ?? (env.ENGINE_URL ? "http" : "fake");
    if (engineMode === "http") {
      if (!env.ENGINE_URL)
        ctx.addIssue({
          code: "custom",
          path: ["ENGINE_URL"],
          message: "required for ENGINE_MODE=http",
        });
      if (!env.ENGINE_SHARED_SECRET) {
        ctx.addIssue({
          code: "custom",
          path: ["ENGINE_SHARED_SECRET"],
          message: "required for ENGINE_MODE=http",
        });
      }
    }
    if (
      engineMode === "fake" &&
      env.NODE_ENV === "production" &&
      env.DUEPROOF_EDITION !== "desktop"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["ENGINE_MODE"],
        message: "the fake engine is not for production",
      });
    }
  })
  .transform((env) => ({
    ...env,
    DATABASE_DRIVER:
      env.DATABASE_DRIVER ?? (env.DATABASE_URL ? ("postgres" as const) : ("pglite" as const)),
    ENGINE_MODE: env.ENGINE_MODE ?? (env.ENGINE_URL ? ("http" as const) : ("fake" as const)),
    AUTH_SIGNUP:
      env.AUTH_SIGNUP ??
      (env.DUEPROOF_EDITION === "hosted" ? ("open" as const) : ("first-user" as const)),
    STORAGE_SIGNING_SECRET:
      env.STORAGE_SIGNING_SECRET ??
      createHmac("sha256", env.AUTH_SECRET).update("dueproof:storage").digest("hex"),
    DUEPROOF_DEV_PAGES: env.DUEPROOF_DEV_PAGES ?? env.NODE_ENV !== "production",
    MAIL_DRIVER:
      env.MAIL_DRIVER ??
      (env.RESEND_API_KEY
        ? ("resend" as const)
        : env.SMTP_URL
          ? ("smtp" as const)
          : ("log" as const)),
  }));

export type Env = z.output<typeof Env>;

export class EnvError extends Error {
  override name = "EnvError";
}

/** Parse an environment. Error messages name variables, never values. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v !== ""),
  );
  const result = Env.safeParse(cleaned);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join(".") || "(env)"}: ${i.message}`);
    throw new EnvError(`Invalid environment:\n${lines.join("\n")}`);
  }
  return result.data;
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
