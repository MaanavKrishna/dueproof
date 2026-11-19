/**
 * H2: Better Auth's HTTP surface is an allowlist. The organisation plugin's
 * endpoints (members, roles, invitations, metadata) and the account
 * endpoints the app doesn't use answer 404 over HTTP, whoever asks; the app
 * changes those only through its own authorised, audited server actions.
 */
import {
  createDatabase,
  type Database,
  eq,
  invitation,
  member,
  migrate,
  organization,
  user,
  uuidv7,
} from "@dueproof/db";
import { unsafeRawDb } from "@dueproof/db/internal";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Auth, CLIENT_AUTH_PATHS, createAuth, getMembership, isClientAuthPath } from "./auth";
import { roles } from "./roles";

const BASE = "https://dueproof.test";
const PW = "correct horse battery";
let database: Database;
let auth: Auth;
let orgId: string;
const cookies: Record<"owner" | "admin" | "manager" | "viewer", string> = {
  owner: "",
  admin: "",
  manager: "",
  viewer: "",
};
const ids: Record<string, string> = {};

async function call(path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) {
  const method = init.method ?? "POST";
  const res = await auth.handler(
    new Request(`${BASE}/api/auth${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        origin: BASE,
        ...(init.cookie ? { cookie: init.cookie } : {}),
      },
      ...(method === "POST" ? { body: JSON.stringify(init.body ?? {}) } : {}),
    }),
  );
  return res;
}

async function signIn(email: string): Promise<string> {
  const res = await call("/sign-in/email", { body: { email, password: PW } });
  expect(res.status).toBe(200);
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

/** A member added the way the app's own actions would. */
async function addMember(email: string, role: "admin" | "manager" | "viewer") {
  const created = await auth.api.signUpEmail({ body: { email, password: PW, name: role } });
  const raw = unsafeRawDb(database);
  // Open sign-up gave them an organisation of their own; move them into ours.
  const [own] = await raw.select().from(member).where(eq(member.userId, created.user.id));
  await raw.delete(member).where(eq(member.userId, created.user.id));
  if (own) await raw.delete(organization).where(eq(organization.id, own.organizationId));
  await raw.insert(member).values({
    id: uuidv7(),
    organizationId: orgId,
    userId: created.user.id,
    role,
    mayApproveReplies: false,
    createdAt: new Date(),
  });
  ids[role] = created.user.id;
}

beforeAll(async () => {
  database = await createDatabase({ driver: "pglite" });
  await migrate(database);
  auth = createAuth({
    database,
    baseURL: BASE,
    secret: "test-secret-test-secret-test-secret-0123",
    signupPolicy: "open",
    rateLimit: false,
  });
  // The owner signs up over HTTP, as a browser does: the endpoint is allowed.
  const up = await call("/sign-up/email", {
    body: { email: "owner@firm.test", password: PW, name: "Owner" },
  });
  expect(up.status).toBe(200);
  const raw = unsafeRawDb(database);
  const [org] = await raw.select().from(organization);
  orgId = org?.id ?? "";
  const [o] = await raw.select().from(user).where(eq(user.email, "owner@firm.test"));
  ids.owner = o?.id ?? "";
  await addMember("admin@firm.test", "admin");
  await addMember("manager@firm.test", "manager");
  await addMember("viewer@firm.test", "viewer");
  cookies.owner = await signIn("owner@firm.test");
  cookies.admin = await signIn("admin@firm.test");
  cookies.manager = await signIn("manager@firm.test");
  cookies.viewer = await signIn("viewer@firm.test");
});

afterAll(async () => {
  await database.close();
});

/** Every organisation-plugin endpoint, with a body that would otherwise do harm. */
const ORG_ENDPOINTS: Array<{ path: string; method: "GET" | "POST"; body?: () => unknown }> = [
  {
    path: "/organization/invite-member",
    method: "POST",
    body: () => ({ email: "evil@attacker.test", role: "admin", organizationId: orgId }),
  },
  { path: "/organization/accept-invitation", method: "POST", body: () => ({ invitationId: "x" }) },
  { path: "/organization/reject-invitation", method: "POST", body: () => ({ invitationId: "x" }) },
  { path: "/organization/cancel-invitation", method: "POST", body: () => ({ invitationId: "x" }) },
  { path: "/organization/get-invitation?id=x", method: "GET" },
  { path: "/organization/list-invitations", method: "GET" },
  { path: "/organization/list-user-invitations", method: "GET" },
  {
    path: "/organization/remove-member",
    method: "POST",
    body: () => ({ memberIdOrEmail: "viewer@firm.test", organizationId: orgId }),
  },
  {
    path: "/organization/update-member-role",
    method: "POST",
    body: () => ({ memberId: ids.viewer, role: "admin", organizationId: orgId }),
  },
  { path: "/organization/get-active-member", method: "GET" },
  { path: "/organization/get-active-member-role", method: "GET" },
  { path: "/organization/leave", method: "POST", body: () => ({ organizationId: orgId }) },
  { path: "/organization/list-members", method: "GET" },
  { path: "/organization/create", method: "POST", body: () => ({ name: "x", slug: "x-y-z" }) },
  { path: "/organization/check-slug", method: "POST", body: () => ({ slug: "x-y-z" }) },
  {
    path: "/organization/update",
    method: "POST",
    body: () => ({
      data: { name: "pwned", metadata: { clientAccess: {} } },
      organizationId: orgId,
    }),
  },
  { path: "/organization/delete", method: "POST", body: () => ({ organizationId: orgId }) },
  { path: "/organization/get-organization", method: "GET" },
  { path: "/organization/get-full-organization", method: "GET" },
  { path: "/organization/set-active", method: "POST", body: () => ({ organizationId: orgId }) },
  { path: "/organization/list", method: "GET" },
  { path: "/organization/create-role", method: "POST", body: () => ({ role: "x" }) },
  { path: "/organization/delete-role", method: "POST", body: () => ({ roleName: "x" }) },
  { path: "/organization/list-roles", method: "GET" },
  { path: "/organization/get-role?roleName=x", method: "GET" },
  { path: "/organization/update-role", method: "POST", body: () => ({ roleName: "x" }) },
  { path: "/organization/has-permission", method: "POST", body: () => ({ permissions: {} }) },
  { path: "/organization/create-team", method: "POST", body: () => ({ name: "x" }) },
  { path: "/organization/remove-team", method: "POST", body: () => ({ teamId: "x" }) },
  { path: "/organization/update-team", method: "POST", body: () => ({ teamId: "x", data: {} }) },
  { path: "/organization/list-teams", method: "GET" },
  { path: "/organization/set-active-team", method: "POST", body: () => ({ teamId: "x" }) },
  { path: "/organization/list-user-teams", method: "GET" },
  { path: "/organization/list-team-members", method: "GET" },
  {
    path: "/organization/add-team-member",
    method: "POST",
    body: () => ({ teamId: "x", userId: "x" }),
  },
  {
    path: "/organization/remove-team-member",
    method: "POST",
    body: () => ({ teamId: "x", userId: "x" }),
  },
];

/** Account endpoints the app doesn't use from the browser. */
const OTHER_BLOCKED: Array<{ path: string; method: "GET" | "POST"; body?: () => unknown }> = [
  { path: "/update-user", method: "POST", body: () => ({ name: "x" }) },
  { path: "/change-email", method: "POST", body: () => ({ newEmail: "x@y.test" }) },
  { path: "/delete-user", method: "POST", body: () => ({ password: PW }) },
  { path: "/list-sessions", method: "GET" },
  { path: "/revoke-sessions", method: "POST" },
  { path: "/list-accounts", method: "GET" },
  { path: "/account-info", method: "GET" },
  { path: "/sign-in/social", method: "POST", body: () => ({ provider: "github" }) },
  { path: "/two-factor/generate-backup-codes", method: "POST", body: () => ({ password: PW }) },
  { path: "/passkey/list-user-passkeys", method: "GET" },
  { path: "/passkey/update-passkey", method: "POST", body: () => ({ id: "x", name: "y" }) },
];

describe("Better Auth over HTTP", () => {
  it("allows only the endpoints a browser needs", () => {
    expect(isClientAuthPath("/sign-in/email")).toBe(true);
    expect(isClientAuthPath("/reset-password/abc123")).toBe(true);
    expect(isClientAuthPath("/sso/saml2/sp/acs/saml-1")).toBe(true);
    expect(isClientAuthPath("/organization/list-members")).toBe(false);
    expect(isClientAuthPath("/organization")).toBe(false);
    expect(isClientAuthPath("/reset-password/a/b")).toBe(false);
    expect(CLIENT_AUTH_PATHS.some((p) => p.startsWith("/organization"))).toBe(false);
  });

  it("answers 404 to every organisation endpoint, for every role", async () => {
    for (const who of ["owner", "admin", "manager", "viewer"] as const) {
      for (const e of ORG_ENDPOINTS) {
        const res = await call(e.path, {
          method: e.method,
          body: e.body?.(),
          cookie: cookies[who],
        });
        expect(res.status, `${who} ${e.path}`).toBe(404);
        // No member list, emails or organisation in the answer.
        expect(await res.text(), `${who} ${e.path}`).not.toMatch(/@firm\.test|"members"/);
      }
    }
  });

  it("answers 404 to the account endpoints the app doesn't use", async () => {
    for (const e of OTHER_BLOCKED) {
      const res = await call(e.path, { method: e.method, body: e.body?.(), cookie: cookies.owner });
      expect(res.status, e.path).toBe(404);
    }
  });

  it("changed nothing: no invitation, no new member, no role or name change", async () => {
    const raw = unsafeRawDb(database);
    expect(await raw.select().from(invitation)).toHaveLength(0);
    expect(await raw.select().from(member).where(eq(member.organizationId, orgId))).toHaveLength(4);
    expect((await getMembership(database, ids.viewer ?? "", orgId))?.role).toBe("viewer");
    expect((await getMembership(database, ids.owner ?? "", orgId))?.role).toBe("owner");
    const [org] = await raw.select().from(organization).where(eq(organization.id, orgId));
    expect(org?.name).not.toBe("pwned");
    expect(org?.metadata ?? null).toBeNull();
  });

  it("still serves the session and sign-out", async () => {
    const session = await call("/get-session", { method: "GET", cookie: cookies.viewer });
    expect(session.status).toBe(200);
    expect(((await session.json()) as { user?: { email?: string } }).user?.email).toBe(
      "viewer@firm.test",
    );
    expect((await call("/sign-out", { cookie: cookies.viewer })).status).toBe(200);
  });

  it("server-side calls still work (the app's own actions use them)", async () => {
    const res = await auth.api.getSession({ headers: new Headers({ cookie: cookies.owner }) });
    expect(res?.user.email).toBe("owner@firm.test");
  });

  it("gives managers no invitation rights in Better Auth's own roles", () => {
    expect(roles.manager.statements).toEqual({});
  });
});
