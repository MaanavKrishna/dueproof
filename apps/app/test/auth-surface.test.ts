/**
 * The auth surface as a browser sees it (H1, H2): /api/auth/* serves only the
 * endpoints the client needs, and an invitation is joined only with its
 * link's token. The sign-up page reveals an invitation only for a valid
 * token, never for an address.
 */
import { createAuth } from "@dueproof/auth";
import { createDatabase, type Database, invitation, member, migrate } from "@dueproof/db";
import { unsafeRawDb } from "@dueproof/db/internal";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import SignUpPage from "../app/(auth)/sign-up/page";
import { inviteMembers } from "../app/actions/team";
import { GET as authGet, POST as authPost } from "../app/api/auth/[...all]/route";
import { parseEnv } from "../lib/env";
import type { Container } from "../lib/server/container";
import { setContainer } from "../lib/server/container";

const APP = "http://localhost:3000";
const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => request.headers,
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));

let database: Database;
let ownerCookie = "";
const PW = "a-long-test-password";

function call(method: "GET" | "POST", path: string, body?: unknown, cookie?: string) {
  const req = new Request(`${APP}/api/auth${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: APP,
      ...(cookie ? { cookie } : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
  });
  return method === "GET" ? authGet(req) : authPost(req);
}

const cookieOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

/** The sign-up page's mode for these search params, as a signed-out visitor. */
async function pageMode(params: Record<string, string>) {
  request.headers = new Headers({ origin: APP });
  const el = (await SignUpPage({ searchParams: Promise.resolve(params) })) as {
    props: { mode: { kind: string } & Record<string, unknown> };
  };
  return el.props.mode;
}

beforeAll(async () => {
  const env = parseEnv({
    NODE_ENV: "test",
    APP_URL: APP,
    AUTH_SECRET: "test-auth-secret-test-auth-secret-0123456789",
    AUTH_SIGNUP: "first-user",
    RATE_LIMIT_ENABLED: "0",
  });
  database = await createDatabase({ driver: "pglite" });
  await migrate(database);
  setContainer({
    env,
    database,
    auth: createAuth({
      database,
      baseURL: APP,
      secret: env.AUTH_SECRET,
      signupPolicy: "first-user",
      rateLimit: false,
    }),
  } as unknown as Container);
  const up = await call("POST", "/sign-up/email", {
    email: "owner@firm.test",
    password: PW,
    name: "Owner",
  });
  expect(up.status).toBe(200);
  ownerCookie = cookieOf(up);
});

afterAll(async () => {
  setContainer(undefined);
  await database.close();
});

describe("/api/auth over HTTP (H2)", () => {
  it("answers 404 to the organisation endpoints, before Better Auth sees them", async () => {
    for (const [method, path] of [
      ["POST", "/organization/invite-member"],
      ["POST", "/organization/update-member-role"],
      ["POST", "/organization/remove-member"],
      ["POST", "/organization/update"],
      ["POST", "/organization/leave"],
      ["POST", "/organization/cancel-invitation"],
      ["POST", "/organization/accept-invitation"],
      ["POST", "/organization/set-active"],
      ["GET", "/organization/list-members"],
      ["GET", "/organization/get-full-organization"],
      ["GET", "/organization/list-invitations"],
      ["GET", "/organization/list"],
      ["POST", "/update-user"],
      ["GET", "/list-sessions"],
      ["GET", "/../api/auth/organization/list-members"],
    ] as const) {
      const res = await call(method, path, { role: "admin" }, ownerCookie);
      expect(res.status, `${method} ${path}`).toBe(404);
    }
  });

  it("still serves the session", async () => {
    const res = await call("GET", "/get-session", undefined, ownerCookie);
    expect(res.status).toBe(200);
  });
});

describe("invitations (H1)", () => {
  let link = "";

  it("the sign-up page says nothing about an address", async () => {
    request.headers = new Headers({ cookie: ownerCookie, origin: APP });
    const res = await inviteMembers({ emails: ["partner@firm.test"], role: "admin" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    link = res.data.invited[0]?.link ?? "";
    expect(await pageMode({ email: "partner@firm.test" })).toEqual({ kind: "closed" });
    expect(await pageMode({})).toEqual({ kind: "closed" });
    expect(await pageMode({ invite: "made-up.token" })).toEqual({ kind: "expired" });
  });

  it("shows the invitation for its link's token", async () => {
    const token = new URL(link).searchParams.get("invite") ?? "";
    expect(await pageMode({ invite: token })).toEqual({
      kind: "invite",
      email: "partner@firm.test",
      orgName: "Owner's organisation",
      role: "admin",
      token,
    });
  });

  it("refuses the invited address without the token, and joins with it once", async () => {
    const token = new URL(link).searchParams.get("invite") ?? "";
    const squat = await call("POST", "/sign-up/email", {
      email: "Partner@firm.test",
      password: PW,
      name: "Mallory",
    });
    expect(squat.status).toBe(403);
    const wrongAddress = await call("POST", "/sign-up/email", {
      email: "mallory@evil.test",
      password: PW,
      name: "Mallory",
      inviteToken: token,
    });
    expect(wrongAddress.status).toBe(403);

    const ok = await call("POST", "/sign-up/email", {
      email: "partner@firm.test",
      password: PW,
      name: "Priya",
      inviteToken: token,
    });
    expect(ok.status).toBe(200);
    const raw = unsafeRawDb(database);
    const members = await raw.select().from(member);
    expect(members.map((m) => m.role).sort()).toEqual(["admin", "owner"]);
    const [inv] = await raw.select().from(invitation);
    expect(inv?.status).toBe("accepted");
    // Used up: the page and the form both refuse it now.
    expect(await pageMode({ invite: token })).toEqual({ kind: "expired" });
    const again = await call("POST", "/sign-up/email", {
      email: "partner.two@firm.test",
      password: PW,
      name: "Again",
      inviteToken: token,
    });
    expect(again.status).toBe(403);
  });
});
