/**
 * The hosted edition, through the real container (lib/server/container.ts
 * reads the environment, opens the database, migrates and wires auth) and
 * the real /api/auth route, as Vercel runs it: open sign-up, each firm in its
 * own organisation, nothing crossing between them, the client IP taken from
 * AUTH_IP_HEADER, and HSTS with preload. The other app tests build their own
 * container, so this is the one that checks the hosted wiring.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { POST as authPost } from "../app/api/auth/[...all]/route";
import { createClient } from "../features/clients/actions";
import { getClientPage, listClients } from "../features/clients/queries";
import { addManualDeadline } from "../features/deadlines/actions";
import { loadDeadlinesPage } from "../features/deadlines/queries";
import { type AuthContext, authorize } from "../lib/authorize";
import { type Container, getContainer, setContainer } from "../lib/server/container";
import { proxy } from "../proxy";

const APP = "https://app.dueproof.test";
const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));

let dir: string;
let c: Container;
const saved = { ...process.env };

function authRequest(path: string, body: unknown, ip: string): Request {
  return new Request(`${APP}/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: APP, "x-real-ip": ip },
    body: JSON.stringify(body),
  });
}

async function signUp(email: string, name: string, ip: string): Promise<string> {
  const res = await authPost(
    authRequest("/sign-up/email", { email, name, password: "a-long-test-password" }, ip),
  );
  expect(res.status, `sign-up of ${email}`).toBe(200);
  return (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}

function ok<T>(r: { ok: true; data: T } | { ok: false; message: string }): T {
  if (!r.ok) throw new Error(`action failed: ${r.message}`);
  return r.data;
}

let firmA: AuthContext;
let firmB: AuthContext;
let cookieA: string;
let cookieB: string;
const as = (cookie: string) => {
  request.headers = new Headers({ cookie, origin: APP });
};

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "dueproof-hosted-"));
  Object.assign(process.env, {
    DUEPROOF_EDITION: "hosted",
    APP_URL: APP,
    AUTH_SECRET: "hosted-auth-secret-hosted-auth-secret-0123",
    AUTH_IP_HEADER: "x-real-ip",
    PGLITE_DATA_DIR: join(dir, "pglite"),
    STORAGE_LOCAL_DIR: join(dir, "files"),
    MAIL_DRIVER: "log",
  });
  delete process.env.AUTH_SIGNUP;
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_DRIVER;
  c = await getContainer();
});

afterAll(async () => {
  await c?.database.close();
  setContainer(undefined);
  process.env = saved;
  await rm(dir, { recursive: true, force: true });
});

describe("the hosted edition", () => {
  it("defaults to open sign-up", () => {
    expect(c.env.DUEPROOF_EDITION).toBe("hosted");
    expect(c.env.AUTH_SIGNUP).toBe("open");
  });

  it("gives each firm that signs up its own organisation, owned by them", async () => {
    cookieA = await signUp("asha@harbour.test", "Asha Rao", "203.0.113.10");
    cookieB = await signUp("nikhil@northline.test", "Nikhil Das", "203.0.113.11");
    firmA = await authorize("client.edit", { headers: new Headers({ cookie: cookieA }) });
    firmB = await authorize("client.edit", { headers: new Headers({ cookie: cookieB }) });
    expect(firmA.orgId).not.toBe(firmB.orgId);
    expect(firmA.role).toBe("owner");
    expect(firmB.role).toBe("owner");
  });

  it("keeps one firm's clients and deadlines from the other", async () => {
    as(cookieA);
    const harbour = ok(await createClient({ name: "Harbour Valley Foods" })).id;
    ok(await addManualDeadline({ title: "Reply to the range officer", dueOn: "2026-12-01" }));
    as(cookieB);
    ok(await createClient({ name: "Northline Traders" }));

    expect((await listClients(firmA)).rows.map((r) => r.name)).toEqual(["Harbour Valley Foods"]);
    expect((await listClients(firmB)).rows.map((r) => r.name)).toEqual(["Northline Traders"]);
    await expect(getClientPage(firmB, harbour)).rejects.toMatchObject({ status: 404 });
    const deadlinesB = await loadDeadlinesPage(firmB);
    expect(deadlinesB.rows.map((r) => r.title)).not.toContain("Reply to the range officer");
    expect(deadlinesB.people.map((p) => p.name)).toEqual(["Nikhil Das"]);
  });

  it("limits sign-ups per client IP, read from AUTH_IP_HEADER", async () => {
    // Hosted allows three sign-ups an hour from one address.
    const ip = "198.51.100.7";
    for (const n of [1, 2, 3]) await signUp(`p${n}@limits.test`, `Person ${n}`, ip);
    const fourth = await authPost(
      authRequest(
        "/sign-up/email",
        { email: "p4@limits.test", name: "Person 4", password: "a-long-test-password" },
        ip,
      ),
    );
    expect(fourth.status).toBe(429);
    // Someone else, behind another address, is not held up by it.
    await signUp("p5@limits.test", "Person 5", "198.51.100.8");
  });

  it("sends HSTS with preload, and a nonce-based CSP, on every page", () => {
    const res = proxy(new NextRequest(`${APP}/today`));
    expect(res.headers.get("strict-transport-security")).toBe(
      "max-age=63072000; includeSubDomains; preload",
    );
    expect(res.headers.get("content-security-policy")).toMatch(/'nonce-[^']+'/);
  });
});
