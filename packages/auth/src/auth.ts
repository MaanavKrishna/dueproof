/**
 * Better Auth for Dueproof (05 §3): email + password (Argon2id), passkeys,
 * TOTP two-factor, organisations with five roles and a "may approve
 * replies" member field, database-backed rate limits, secure cookies, and
 * telemetry off (no phone-home, 08).
 *
 * Sign-up policy:
 * - "first-user" (self-hosted, desktop): the first person to sign up creates
 *   the organisation and becomes its owner. After that, sign-up is open only
 *   to email addresses with a pending invitation; they join with the invited
 *   role.
 * - "open" (hosted): anyone may sign up. Someone with a pending invitation
 *   joins that organisation; anyone else gets a new organisation as owner.
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
  user,
  uuidv7,
  withOrg,
} from "@dueproof/db";
import { type AnyPgDatabase, unsafeRawDb } from "@dueproof/db/internal";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { organization as organizationPlugin } from "better-auth/plugins/organization";
import { twoFactor } from "better-auth/plugins/two-factor";
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
}

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
                input: true,
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
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const allowed = await maySignUp(raw, config.signupPolicy, user.email);
            if (!allowed) {
              throw new APIError("FORBIDDEN", {
                message:
                  "Sign-up is by invitation. Ask an administrator of your organisation to invite you.",
              });
            }
            return { data: user };
          },
          after: async (user) => {
            await placeNewUser(config, raw, { id: user.id, email: user.email, name: user.name });
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

async function pendingInvitation(raw: AnyPgDatabase, email: string) {
  const [row] = await raw
    .select()
    .from(invitation)
    .where(
      and(
        sql`lower(${invitation.email}) = lower(${email})`,
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(invitation.createdAt))
    .limit(1);
  return row;
}

async function maySignUp(
  raw: AnyPgDatabase,
  policy: SignupPolicy,
  email: string,
): Promise<boolean> {
  if (policy === "open") return true;
  const [orgs] = await raw.select({ n: count() }).from(organization);
  if (!orgs || orgs.n === 0) return true; // first run
  return (await pendingInvitation(raw, email)) !== undefined;
}

/** After sign-up: join the invited organisation, or create one and become its owner. */
async function placeNewUser(
  config: AuthConfig,
  raw: AnyPgDatabase,
  user: { id: string; email: string; name: string },
): Promise<void> {
  const invite = await pendingInvitation(raw, user.email);
  if (invite) {
    const role = (invite.role ?? "member") as Role;
    await raw.transaction(async (tx) => {
      await tx.insert(member).values({
        id: uuidv7(),
        organizationId: invite.organizationId,
        userId: user.id,
        role,
        mayApproveReplies: APPROVER_ROLES_BY_DEFAULT.includes(role),
        createdAt: new Date(),
      });
      await tx.update(invitation).set({ status: "accepted" }).where(eq(invitation.id, invite.id));
    });
    await withOrg(config.database, invite.organizationId, (tx, ctx) =>
      audit.write(tx, ctx, {
        actor: user.id,
        action: "member.join",
        targetType: "user",
        targetId: user.id,
        detail: { role, invitationId: invite.id },
      }),
    );
    return;
  }

  const orgId = uuidv7();
  const created = await raw.transaction(async (tx) => {
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
  if (!created) {
    // Lost the first-run race and has no invitation: undo the account.
    await raw.execute(sql`delete from "user" where id = ${user.id}`);
    throw new APIError("FORBIDDEN", { message: "Sign-up is by invitation." });
  }
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
  await config.onOrganisationCreated?.(orgId, user.id);
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

/** A member of an organisation, with the name and email the app shows. */
export interface OrgMember extends Membership {
  name: string;
  email: string;
  image: string | null;
}

/**
 * Everyone in an organisation (owners, assignees, @mentions). Read here
 * because the member and user tables belong to Better Auth, outside the
 * org-scoped app role.
 */
export async function listOrgMembers(database: Database, orgId: string): Promise<OrgMember[]> {
  const raw = unsafeRawDb(database);
  const rows = await raw
    .select({
      userId: member.userId,
      role: member.role,
      mayApproveReplies: member.mayApproveReplies,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, orgId))
    .orderBy(asc(user.name));
  return rows.map((r) => ({
    orgId,
    userId: r.userId,
    role: r.role as Role,
    mayApproveReplies: r.mayApproveReplies ?? false,
    name: r.name,
    email: r.email,
    image: r.image,
  }));
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
