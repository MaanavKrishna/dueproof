import {
  account,
  createDatabase,
  type Database,
  eq,
  invitation,
  member,
  migrate,
  organization,
  orgSettings,
  rowsOf,
  sql,
  user,
  uuidv7,
  withOrg,
} from "@dueproof/db";
import { unsafeRawDb } from "@dueproof/db/internal";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Auth, createAuth, isFirstRun } from "./auth";
import { inviteToken } from "./invite";

/**
 * Sign-up does several things after Better Auth has stored the account:
 * create (or join) the organisation, then write its settings and the audit
 * entry through withOrg(). When a later step fails (on hosted Postgres it
 * did: `permission denied to set role "dueproof_app"`), the person must not
 * be left with an account they can't use and an email address they can't
 * sign up with again, nor the install with an empty organisation that
 * blocks the first-run screen.
 *
 * The failure here is the real one: the app runs as a database owner that
 * is not a superuser and may not switch to the app role.
 */
let database: Database;
let auth: Auth;
const PASSWORD = "correct horse battery";
const SECRET = "test-secret-test-secret-test-secret-0123";

async function breakAppRole(broken: boolean) {
  await unsafeRawDb(database).execute(
    sql.raw(`GRANT dueproof_app TO neon_owner WITH SET ${broken ? "FALSE" : "TRUE"}`),
  );
}

async function failure(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const err = e as Error & { cause?: Error };
    return `${err.message} ${err.cause?.message ?? ""}`;
  }
  throw new Error("expected sign-up to fail");
}

beforeAll(async () => {
  database = await createDatabase({ driver: "pglite" });
  const raw = unsafeRawDb(database);
  await raw.execute(sql.raw("CREATE ROLE neon_owner LOGIN CREATEROLE NOSUPERUSER"));
  await raw.execute(sql.raw("ALTER DATABASE postgres OWNER TO neon_owner"));
  await raw.execute(sql.raw("SET SESSION AUTHORIZATION neon_owner"));
  await migrate(database);
  auth = createAuth({
    database,
    baseURL: "https://dueproof.test",
    secret: SECRET,
    signupPolicy: "first-user",
    rateLimit: false,
  });
});

afterAll(async () => {
  await database.close();
});

describe("a sign-up whose organisation can't be finished", () => {
  it("is undone, so the first-run screen and the email address stay free", async () => {
    await breakAppRole(true);
    const reason = await failure(
      auth.api.signUpEmail({
        body: { email: "asha@harbour.test", password: PASSWORD, name: "Asha" },
      }),
    );
    expect(reason).toMatch(/set role|permission/i);

    const raw = unsafeRawDb(database);
    expect(await raw.select().from(user)).toEqual([]);
    expect(await raw.select().from(account)).toEqual([]);
    expect(await raw.select().from(organization)).toEqual([]);
    expect(await raw.select().from(member)).toEqual([]);
    expect(await isFirstRun(database)).toBe(true);
  });

  it("works when tried again once the database is fixed", async () => {
    await breakAppRole(false);
    const res = await auth.api.signUpEmail({
      body: { email: "asha@harbour.test", password: PASSWORD, name: "Asha" },
    });
    const raw = unsafeRawDb(database);
    const [m] = await raw.select().from(member).where(eq(member.userId, res.user.id));
    expect(m?.role).toBe("owner");
    const orgId = m?.organizationId as string;
    const [settings, entries] = await withOrg(database, orgId, async (tx) => [
      await tx.select().from(orgSettings),
      rowsOf<{ action: string }>(await tx.execute(sql`select action from audit`)),
    ]);
    expect(settings).toHaveLength(1);
    expect(entries.map((e) => (e as { action: string }).action)).toContain("organisation.create");
    // And the person can sign in.
    const signedIn = await auth.api.signInEmail({
      body: { email: "asha@harbour.test", password: PASSWORD },
    });
    expect(signedIn.user.id).toBe(res.user.id);
  });

  it("leaves an invitation pending when joining fails, so the link still works", async () => {
    const raw = unsafeRawDb(database);
    const [org] = await raw.select().from(organization);
    const [owner] = await raw.select().from(user);
    const inviteId = uuidv7();
    await raw.insert(invitation).values({
      id: inviteId,
      organizationId: org?.id as string,
      email: "vik@harbour.test",
      role: "member",
      status: "pending",
      expiresAt: new Date(Date.now() + 86_400_000),
      inviterId: owner?.id as string,
      createdAt: new Date(),
    });

    // The link's token rides along with the sign-up, as the app's form sends it.
    const token = inviteToken(SECRET, inviteId);
    const viaLink = () =>
      auth.api.signUpEmail({
        body: {
          email: "vik@harbour.test",
          password: PASSWORD,
          name: "Vik",
          ...{ inviteToken: token },
        },
      });
    await breakAppRole(true);
    await failure(viaLink());
    expect(await raw.select().from(user).where(eq(user.email, "vik@harbour.test"))).toEqual([]);
    const [inv] = await raw.select().from(invitation).where(eq(invitation.id, inviteId));
    expect(inv?.status).toBe("pending");
    expect(await raw.select().from(member)).toHaveLength(1);

    await breakAppRole(false);
    const res = await viaLink();
    const [m] = await raw.select().from(member).where(eq(member.userId, res.user.id));
    expect(m).toMatchObject({ organizationId: org?.id, role: "member" });
  });
});
