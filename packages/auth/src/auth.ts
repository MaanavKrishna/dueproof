/**
 * Better Auth for Dueproof (05 §3): email + password (Argon2id), passkeys,
 * TOTP two-factor, organisations with five roles and a "may approve
 * replies" member field, database-backed rate limits, secure cookies, and
 * telemetry off (no phone-home, 08).
 *
 * Sign-up policy:
 * - "first-user" (self-hosted, desktop): the first person to sign up creates
 *   the organisation and becomes its owner. After that, sign-up needs an
 *   invitation link: its token (`inviteToken` in the sign-up body) must
 *   open a pending, unexpired invitation for the same address. They join
 *   with the invited role, and the invitation is used up.
 * - "open" (hosted): anyone may sign up. With a valid invitation token they
 *   join that organisation; anyone else gets a new organisation as owner.
 *   Knowing an invited address is never enough (H1).
 */

import { passkey } from "@better-auth/passkey";
import type { Role } from "@dueproof/contracts";
import {
  and,
  asc,
  audit,
  authSchema,
  count,
  type Database,
  eq,
  gt,
  invitation,
  member,
  organization,
  orgSettings,
  sql,
  uuidv7,
  withOrg,
} from "@dueproof/db";
import { type AnyPgDatabase, unsafeRawDb } from "@dueproof/db/internal";
import { type BetterAuthPlugin, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { organization as organizationPlugin } from "better-auth/plugins/organization";
import { twoFactor } from "better-auth/plugins/two-factor";
import { type OpenInvitation, openInvitation } from "./invite";
import { hashPassword, verifyPassword } from "./password";
import { APPROVER_ROLES_BY_DEFAULT, ac, roles } from "./roles";

export type SignupPolicy = "first-user" | "open";

export interface AuthConfig {
  database: Database;
  /** Public URL of the app, e.g. "https://dueproof.example.com". */
  baseURL: string;
  /** At least 32 random bytes; signs cookies and tokens. */
  secret: string;
  signupPolicy: SignupPolicy;
  /** Extra origins allowed to call auth routes (the desktop shell, a dev port). */
  trustedOrigins?: string[];
  /** Passkey relying party. Defaults: rpID = hostname of baseURL, rpName "Dueproof". */
  passkey?: { rpID?: string; rpName?: string };
  /** Defaults to true when baseURL is https. */
  secureCookies?: boolean;
  /** Defaults to true. Tests may turn it off. */
  rateLimit?: boolean;
  /** Headers to read the client IP from, set by our own proxy (Caddy, Vercel). */
  ipAddressHeaders?: string[];
  /** Called after an organisation is created for a new owner. */
  onOrganisationCreated?: (orgId: string, userId: string) => Promise<void>;
  /**
   * Extra Better Auth plugins, added after ours. The app passes the Business
   * plugins from `ee/` here (SAML SSO) when that directory is present; this
   * package never imports `ee/` (house rule 12).
   */
  plugins?: readonly BetterAuthPlugin[];
  /**
   * Whether someone may sign up without an invitation because an identity
   * provider vouches for them (SSO). `path` is the auth endpoint creating the
   * user, so a password sign-up never qualifies. Their organisation comes
   * from the provider, so no organisation is created for them.
   */
  externalSignUp?: (
    email: string,
    path: string | undefined,
    /** The endpoint's path parameters, e.g. the asserting SSO provider's id. */
    params?: Record<string, string | undefined>,
  ) => Promise<boolean>;
  /**
   * Sends a password reset link (the app's mail driver). Without it, asking
   * for a reset is refused. The link is a secret: never log it.
   */
  sendResetPassword?: (data: {
    user: { id: string; email: string; name: string };
    url: string;
  }) => Promise<void>;
}

/**
 * The Better Auth endpoints a browser may call (H2): signing in and out, the
 * session, password reset, passkeys and two-factor. An allowlist: every other
 * endpoint (the organisation plugin's member, role, invitation and metadata
 * endpoints above all) answers 404 over HTTP. The app changes those only
 * through its own server actions, which authorise, check the role hierarchy
 * and write audit entries. Server-side calls (`auth.api.*`) are not affected.
 */
export const CLIENT_AUTH_PATHS: readonly string[] = [
  "/ok",
  "/error",
  "/get-session",
  "/sign-in/email",
  "/sign-up/email",
  "/sign-out",
  "/request-password-reset",
  "/reset-password",
  "/reset-password/:token",
  "/passkey/generate-authenticate-options",
  "/passkey/verify-authentication",
  "/passkey/generate-register-options",
  "/passkey/verify-registration",
  "/passkey/delete-passkey",
  "/two-factor/enable",
  "/two-factor/disable",
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
  // SAML sign-in, when ee/ is loaded. Its own gate (ee/sso) allows only the
  // sign-in and identity-provider endpoints under /sso/ and refuses the rest.
  "/sign-in/sso",
];

/** Whether a browser may call this auth path (`/api/auth` stripped, or the endpoint's template). */
export function isClientAuthPath(path: string): boolean {
  if (CLIENT_AUTH_PATHS.includes(path)) return true;
  // The emailed reset link: /reset-password/<token>.
  if (/^\/reset-password\/[^/]+$/.test(path)) return true;
  return path.startsWith("/sso/");
}

const httpAllowlist = {
  id: "dueproof-http-allowlist",
  hooks: {
    before: [
      {
        matcher: () => true,
        handler: createAuthMiddleware(async (ctx) => {
          // ctx.request is set only for HTTP requests, not for auth.api calls.
          if (ctx.request && !isClientAuthPath(ctx.path))
            throw new APIError("NOT_FOUND", { message: "Not found." });
        }),
      },
    ],
  },
} satisfies BetterAuthPlugin;

/** A reset link works once, for an hour. */
export const RESET_LINK_SECONDS = 60 * 60;

const ORG_NAME_FALLBACK = "My organisation";

export function createAuth(config: AuthConfig) {
  const raw = unsafeRawDb(config.database);
  const url = new URL(config.baseURL);
  const secure = config.secureCookies ?? url.protocol === "https:";

  return betterAuth({
    appName: "Dueproof",
    baseURL: config.baseURL,
    basePath: "/api/auth",
    secret: config.secret,
    trustedOrigins: config.trustedOrigins ?? [],
    telemetry: { enabled: false },
    database: drizzleAdapter(raw, {
      provider: "pg",
      schema: authSchema,
      // PGlite has one connection: no adapter-level transactions around hooks.
      transaction: false,
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 256,
      autoSignIn: true,
      password: { hash: hashPassword, verify: verifyPassword },
      resetPasswordTokenExpiresIn: RESET_LINK_SECONDS,
      // A new password signs out every other session (a stolen one included).
      revokeSessionsOnPasswordReset: true,
      ...(config.sendResetPassword
        ? {
            sendResetPassword: async ({
              user,
              url,
            }: {
              user: { id: string; email: string; name: string };
              url: string;
            }) => {
              await config.sendResetPassword?.({
                user: { id: user.id, email: user.email, name: user.name },
                url,
              });
            },
          }
        : {}),
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      freshAge: 60 * 15,
    },
    rateLimit: {
      enabled: config.rateLimit ?? true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        // 05 §3a. Per IP; per-account lockout needs a counter of our own (see report).
        "/sign-in/email": { window: 15 * 60, max: 20 },
        "/sign-up/email": { window: 60 * 60, max: 3 },
        "/two-factor/verify-totp": { window: 15 * 60, max: 10 },
        "/two-factor/verify-backup-code": { window: 15 * 60, max: 10 },
        "/request-password-reset": { window: 60 * 60, max: 5 },
        "/passkey/verify-authentication": { window: 15 * 60, max: 20 },
      },
    },
    advanced: {
      cookiePrefix: "dueproof",
      useSecureCookies: secure,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure, path: "/" },
      database: { generateId: () => uuidv7() },
      ...(config.ipAddressHeaders
        ? { ipAddress: { ipAddressHeaders: config.ipAddressHeaders } }
        : {}),
    },
    plugins: [
      httpAllowlist,
      organizationPlugin({
        ac,
        roles,
        creatorRole: "owner",
        // Organisations are made by the sign-up policy below, not by members.
        allowUserToCreateOrganization: false,
        schema: {
          member: {
            additionalFields: {
              mayApproveReplies: {
                type: "boolean",
                required: false,
                defaultValue: false,
                // Set only by the app's own team actions, never by a caller.
                input: false,
              },
            },
          },
        },
      }),
      twoFactor({ issuer: "Dueproof" }),
      passkey({
        rpID: config.passkey?.rpID ?? url.hostname,
        rpName: config.passkey?.rpName ?? "Dueproof",
        origin: url.origin,
      }),
      ...(config.plugins ?? []),
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (user, ctx) => {
            const token = inviteTokenOf(ctx);
            if (token !== undefined) {
              // A link was used: it must be good, and for this address.
              if (!(await openInvitation(raw, config.secret, token, user.email)))
                throw new APIError("FORBIDDEN", {
                  message:
                    "This invitation link has expired, was cancelled or was already used, or it's for another address. Ask for a new one.",
                });
              return { data: user };
            }
            const allowed =
              (await maySignUp(raw, config.signupPolicy)) ||
              ((await config.externalSignUp?.(user.email, ctx?.path, ctx?.params)) ?? false);
            if (!allowed) {
              throw new APIError("FORBIDDEN", {
                message:
                  "Sign-up is by invitation. Open the link in your invitation, or ask an administrator of your organisation to invite you.",
              });
            }
            return { data: user };
          },
          after: async (user, ctx) => {
            await placeNewUser(
              config,
              raw,
              { id: user.id, email: user.email, name: user.name },
              ctx?.path,
              inviteTokenOf(ctx),
              ctx?.params,
            );
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const s = session as typeof session & { activeOrganizationId?: string | null };
            if (s.activeOrganizationId) return { data: s };
            const [first] = await raw
              .select({ orgId: member.organizationId })
              .from(member)
              .where(eq(member.userId, s.userId))
              .orderBy(asc(member.createdAt))
              .limit(1);
            return { data: { ...s, activeOrganizationId: first?.orgId ?? null } };
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** The invitation token in a sign-up request's body, if one was sent. */
function inviteTokenOf(ctx: { body?: unknown } | null | undefined): string | undefined {
  const body = ctx?.body;
  if (!body || typeof body !== "object" || !("inviteToken" in body)) return undefined;
  const token = (body as { inviteToken?: unknown }).inviteToken;
  return typeof token === "string" && token ? token : undefined;
}

/** Without an invitation link: open sign-up, or the very first account of an install. */
async function maySignUp(raw: AnyPgDatabase, policy: SignupPolicy): Promise<boolean> {
  if (policy === "open") return true;
  const [orgs] = await raw.select({ n: count() }).from(organization);
  return !orgs || orgs.n === 0; // first run
}

/** Undo an account whose sign-up can't complete, then refuse. */
async function refuseNewUser(raw: AnyPgDatabase, userId: string, message: string): Promise<never> {
  await raw.execute(sql`delete from "user" where id = ${userId}`);
  throw new APIError("FORBIDDEN", { message });
}

/**
 * After sign-up: join the invitation's organisation (the token was checked
 * before the account was made), or create one and become its owner.
 *
 * Better Auth runs this after it has stored the account and its password, so
 * if a later step fails, what was made here and the account are undone before
 * the error goes back: the person can try again, the invitation stays usable,
 * and a half-made organisation never blocks the first-run screen.
 */
async function placeNewUser(
  config: AuthConfig,
  raw: AnyPgDatabase,
  user: { id: string; email: string; name: string },
  path: string | undefined,
  token: string | undefined,
  params: Record<string, string | undefined> | undefined,
): Promise<void> {
  let invite: OpenInvitation | null = null;
  if (token !== undefined) {
    invite = await openInvitation(raw, config.secret, token, user.email);
    if (!invite)
      return refuseNewUser(raw, user.id, "This invitation link has expired or was already used.");
  } else if (await config.externalSignUp?.(user.email, path, params)) {
    return;
  }
  if (invite) {
    const accepted = invite;
    const role = (accepted.role ?? "member") as Role;
    let used: boolean;
    try {
      used = await raw.transaction(async (tx) => {
        // Single use: only the request that flips it from pending joins.
        const rows = await tx
          .update(invitation)
          .set({ status: "accepted" })
          .where(
            and(
              eq(invitation.id, accepted.id),
              eq(invitation.status, "pending"),
              gt(invitation.expiresAt, new Date()),
            ),
          )
          .returning({ id: invitation.id });
        if (rows.length === 0) return false;
        await tx.insert(member).values({
          id: uuidv7(),
          organizationId: accepted.organizationId,
          userId: user.id,
          role,
          mayApproveReplies: APPROVER_ROLES_BY_DEFAULT.includes(role),
          createdAt: new Date(),
        });
        return true;
      });
    } catch (e) {
      await undoSignUp(raw, user.id, {});
      throw e;
    }
    if (!used)
      return refuseNewUser(raw, user.id, "This invitation link has expired or was already used.");
    try {
      await withOrg(config.database, accepted.organizationId, (tx, ctx) =>
        audit.write(tx, ctx, {
          actor: user.id,
          action: "member.join",
          targetType: "user",
          targetId: user.id,
          detail: { role, invitationId: accepted.id },
        }),
      );
    } catch (e) {
      await undoSignUp(raw, user.id, { invitationId: accepted.id });
      throw e;
    }
    return;
  }

  const orgId = uuidv7();
  let created: boolean;
  try {
    created = await raw.transaction(async (tx) => {
      // Two first sign-ups at once: only one may create the organisation.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('dueproof:first-run'))`);
      if (config.signupPolicy === "first-user") {
        const [orgs] = await tx.select({ n: count() }).from(organization);
        if (orgs && orgs.n > 0) return false;
      }
      const now = new Date();
      await tx.insert(organization).values({
        id: orgId,
        name: user.name ? `${user.name}'s organisation` : ORG_NAME_FALLBACK,
        slug: `org-${orgId.replace(/-/g, "").slice(-16)}`,
        createdAt: now,
      });
      await tx.insert(member).values({
        id: uuidv7(),
        organizationId: orgId,
        userId: user.id,
        role: "owner",
        mayApproveReplies: true,
        createdAt: now,
      });
      return true;
    });
  } catch (e) {
    await undoSignUp(raw, user.id, {});
    throw e;
  }
  if (!created) {
    // Lost the first-run race and has no invitation: undo the account.
    await raw.execute(sql`delete from "user" where id = ${user.id}`);
    throw new APIError("FORBIDDEN", { message: "Sign-up is by invitation." });
  }
  try {
    await withOrg(config.database, orgId, async (tx, ctx) => {
      await tx.insert(orgSettings).values({ orgId }).onConflictDoNothing();
      await audit.write(tx, ctx, {
        actor: user.id,
        action: "organisation.create",
        targetType: "organisation",
        targetId: orgId,
        detail: { policy: config.signupPolicy },
      });
    });
  } catch (e) {
    // withOrg rolled its own work back, so the organisation holds no tenant
    // rows yet and can go (its member row goes with it).
    await undoSignUp(raw, user.id, { orgId });
    throw e;
  }
  await config.onOrganisationCreated?.(orgId, user.id);
}

/**
 * Remove a sign-up that couldn't be finished: the new organisation (if any),
 * the invitation's acceptance (if any), and the account with its password and
 * sessions (they cascade from the user). Best effort: the first failure is
 * the one worth reporting, and the caller rethrows it.
 */
async function undoSignUp(
  raw: AnyPgDatabase,
  userId: string,
  made: { orgId?: string; invitationId?: string },
): Promise<void> {
  try {
    await raw.transaction(async (tx) => {
      if (made.orgId) await tx.delete(organization).where(eq(organization.id, made.orgId));
      if (made.invitationId) {
        await tx
          .update(invitation)
          .set({ status: "pending" })
          .where(eq(invitation.id, made.invitationId));
      }
      await tx.execute(sql`delete from "user" where id = ${userId}`);
    });
  } catch {
    // Nothing more can be done here.
  }
}

export interface Membership {
  orgId: string;
  userId: string;
  role: Role;
  mayApproveReplies: boolean;
}

/** The member row for a user in an organisation, or null. */
export async function getMembership(
  database: Database,
  userId: string,
  orgId: string,
): Promise<Membership | null> {
  const raw = unsafeRawDb(database);
  const [row] = await raw
    .select()
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, orgId)))
    .limit(1);
  if (!row) return null;
  return {
    orgId: row.organizationId,
    userId: row.userId,
    role: row.role as Role,
    mayApproveReplies: row.mayApproveReplies ?? false,
  };
}

/** The organisation a user joined first, for sessions without an active one. */
export async function firstMembershipOrg(
  database: Database,
  userId: string,
): Promise<string | null> {
  const raw = unsafeRawDb(database);
  const [row] = await raw
    .select({ orgId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt))
    .limit(1);
  return row?.orgId ?? null;
}

/** Whether the install has an organisation yet (first-run screen). */
export async function isFirstRun(database: Database): Promise<boolean> {
  const raw = unsafeRawDb(database);
  const [orgs] = await raw.select({ n: count() }).from(organization);
  return !orgs || orgs.n === 0;
}
