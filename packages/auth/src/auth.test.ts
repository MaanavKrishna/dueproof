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
  uuidv7,
  withOrg,
} from "@dueproof/db";
import { unsafeRawDb } from "@dueproof/db/internal";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Auth, createAuth, getMembership, isFirstRun, listOrgMembers } from "./auth";
import { hashPassword, verifyPassword } from "./password";

const BASE = "https://dueproof.test";
let database: Database;
let auth: Auth;

function signUp(email: string, name = "Asha Rao") {
  return auth.api.signUpEmail({ body: { email, password: "correct horse battery", name } });
}

beforeAll(async () => {
  database = await createDatabase({ driver: "pglite" });
  await migrate(database);
  auth = createAuth({
    database,
    baseURL: BASE,
    secret: "test-secret-test-secret-test-secret-0123",
    signupPolicy: "first-user",
    rateLimit: false,
  });
});
afterAll(async () => {
  await database.close();
});

describe("passwords", () => {
  it("hashes with Argon2id and verifies", async () => {
    const hash = await hashPassword("s3cret-pass");
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword({ hash, password: "s3cret-pass" })).toBe(true);
    expect(await verifyPassword({ hash, password: "wrong" })).toBe(false);
  });
});

describe("first run (self-hosted)", () => {
  let ownerId: string;

  it("the first sign-up creates the organisation and makes them owner", async () => {
    expect(await isFirstRun(database)).toBe(true);
    const res = await signUp("owner@firm.test");
    ownerId = res.user.id;
    expect(await isFirstRun(database)).toBe(false);

    const raw = unsafeRawDb(database);
    const orgs = await raw.select().from(organization);
    expect(orgs).toHaveLength(1);
    const orgId = orgs[0]?.id ?? "";
    const m = await getMembership(database, ownerId, orgId);
    expect(m).toEqual({ orgId, userId: ownerId, role: "owner", mayApproveReplies: true });

    const [acct] = await raw.select().from(account).where(eq(account.userId, ownerId));
    expect(acct?.password).toMatch(/^\$argon2id\$/);

    const settings = await withOrg(database, orgId, (tx) => tx.select().from(orgSettings));
    expect(settings[0]?.timezone).toBe("Asia/Kolkata");
  });

  it("the session points at the new organisation", async () => {
    const res = await auth.api.signInEmail({
      body: { email: "owner@firm.test", password: "correct horse battery" },
      returnHeaders: true,
    });
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/__Secure-dueproof\.session_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Secure/);
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: cookie.split(";")[0] ?? "" }),
    });
    const raw = unsafeRawDb(database);
    const [org] = await raw.select().from(organization);
    const active = (session?.session as { activeOrganizationId?: string } | undefined)
      ?.activeOrganizationId;
    expect(active).toBe(org?.id);
  });

  it("afterwards, public sign-up is refused", async () => {
    await expect(signUp("stranger@elsewhere.test")).rejects.toThrow(/invitation/);
  });

  it("an invited person can sign up and joins with the invited role", async () => {
    const raw = unsafeRawDb(database);
    const [org] = await raw.select().from(organization);
    await raw.insert(invitation).values({
      id: uuidv7(),
      organizationId: org?.id ?? "",
      email: "Clerk@Firm.test",
      role: "member",
      status: "pending",
      expiresAt: new Date(Date.now() + 86_400_000),
      inviterId: ownerId,
    });
    const res = await signUp("clerk@firm.test", "Ravi");
    const m = await getMembership(database, res.user.id, org?.id ?? "");
    expect(m?.role).toBe("member");
    expect(m?.mayApproveReplies).toBe(false);
    const [inv] = await raw.select().from(invitation);
    expect(inv?.status).toBe("accepted");
    expect(await raw.select().from(organization)).toHaveLength(1);
    const members = await raw.select().from(member);
    expect(members).toHaveLength(2);
  });

  it("lists the organisation's members with names, and nobody else's", async () => {
    const raw = unsafeRawDb(database);
    const [org] = await raw.select().from(organization);
    const list = await listOrgMembers(database, org?.id ?? "");
    expect(list.map((m) => [m.name, m.role])).toEqual([
      ["Asha Rao", "owner"],
      ["Ravi", "member"],
    ]);
    expect(list[0]?.mayApproveReplies).toBe(true);
    expect(await listOrgMembers(database, "another-org")).toEqual([]);
  });
});

describe("open sign-up (hosted)", () => {
  it("gives each new person their own organisation", async () => {
    const db2 = await createDatabase({ driver: "pglite" });
    await migrate(db2);
    const hosted = createAuth({
      database: db2,
      baseURL: "http://localhost:3000",
      secret: "test-secret-test-secret-test-secret-0123",
      signupPolicy: "open",
      rateLimit: false,
    });
    const a = await hosted.api.signUpEmail({
      body: { email: "a@a.test", password: "a-long-password", name: "A" },
    });
    const b = await hosted.api.signUpEmail({
      body: { email: "b@b.test", password: "b-long-password", name: "B" },
    });
    const raw = unsafeRawDb(db2);
    expect(await raw.select().from(organization)).toHaveLength(2);
    const ma = await raw.select().from(member).where(eq(member.userId, a.user.id));
    const mb = await raw.select().from(member).where(eq(member.userId, b.user.id));
    expect(ma[0]?.role).toBe("owner");
    expect(mb[0]?.role).toBe("owner");
    expect(ma[0]?.organizationId).not.toBe(mb[0]?.organizationId);
    await db2.close();
  });
});

describe("rate limits", () => {
  it("limits sign-in attempts per IP", async () => {
    const db3 = await createDatabase({ driver: "pglite" });
    await migrate(db3);
    const limited = createAuth({
      database: db3,
      baseURL: BASE,
      secret: "test-secret-test-secret-test-secret-0123",
      signupPolicy: "first-user",
      ipAddressHeaders: ["x-forwarded-for"],
    });
    const attempt = () =>
      limited.handler(
        new Request(`${BASE}/api/auth/sign-in/email`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: BASE,
            "x-forwarded-for": "203.0.113.9",
          },
          body: JSON.stringify({ email: "nobody@x.test", password: "wrong-password" }),
        }),
      );
    const statuses: number[] = [];
    for (let i = 0; i < 22; i++) statuses.push((await attempt()).status);
    expect(statuses.slice(0, 20).every((s) => s === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
    await db3.close();
  });
});
