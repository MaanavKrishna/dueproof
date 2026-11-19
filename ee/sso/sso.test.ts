/**
 * SAML SSO end to end against a mock identity provider (samlify, with the
 * TEST certificate in ./test-idp): the licence gate, provider registration
 * from the server only, SP-initiated sign-in, the signed assertion at the
 * ACS, and the person joining the organisation with the default role.
 */
import { type Auth, createAuth, getMembership } from "@dueproof/auth";
import { createDatabase, type Database, eq, migrate, organization, user } from "@dueproof/db";
import { unsafeRawDb } from "@dueproof/db/internal";
import type { SsoRole } from "@dueproof/plugins";
import * as samlify from "samlify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { domainProofRecord, parseSsoConfig, providerIdFor } from "./config";
import {
  allowsSignUp,
  anyConfigured,
  listProviders,
  type ResolveTxt,
  removeProvider,
  saveProvider,
  ssoAuthPlugins,
} from "./sso";
import { idpMetadata, TEST_IDP } from "./test-idp/fixture";

const BASE = "https://dueproof.firm.test";
let database: Database;
let auth: Auth;
let licensed = true;
let ownerHeaders: Headers;
let orgId: string;
const joins: Array<{ orgId: string; userId: string; role: SsoRole }> = [];

function request(path: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set("origin", BASE);
  if (init.cookie) headers.set("cookie", init.cookie);
  return auth.handler(new Request(`${BASE}/api/auth${path}`, { ...init, headers }));
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
    plugins: ssoAuthPlugins({
      appUrl: BASE,
      isLicensed: async () => licensed,
      onJoin: async (e) => {
        joins.push(e);
      },
    }),
    externalSignUp: (email, path, params) => allowsSignUp(database, email, path, params),
  });
  await auth.api.signUpEmail({
    body: { email: "owner@firm.test", password: "correct horse battery", name: "Owner" },
  });
  const signedIn = await auth.api.signInEmail({
    body: { email: "owner@firm.test", password: "correct horse battery" },
    returnHeaders: true,
  });
  const cookie = (signedIn.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  ownerHeaders = new Headers({ cookie });
  const [org] = await unsafeRawDb(database).select().from(organization);
  orgId = org?.id ?? "";
  samlify.setSchemaValidator({ validate: async () => "skipped in tests" });
});

afterAll(async () => {
  await database.close();
});

const config = () =>
  parseSsoConfig({ metadataXml: idpMetadata(), domains: "firm.test", defaultRole: "viewer" });

/** DNS as it would answer once the firm has published its proof record for firm.test. */
const proved: ResolveTxt = async (name) => {
  const r = domainProofRecord(orgId, "firm.test");
  if (name === r.name) return [[r.value]];
  throw Object.assign(new Error("ENODATA"), { code: "ENODATA" });
};
const opts = () => ({ resolveTxt: proved });

describe("SSO set-up", () => {
  it("refuses to register a provider without a licence", async () => {
    licensed = false;
    await expect(
      saveProvider(auth, database, ownerHeaders, orgId, await config(), BASE, opts()),
    ).rejects.toThrow(/Business licence/);
    expect(await anyConfigured(database)).toBe(false);
    licensed = true;
  });

  it("needs proof of the domain before an identity provider may use it (S1)", async () => {
    const nothing: ResolveTxt = async () => {
      throw new Error("ENOTFOUND");
    };
    const record = domainProofRecord(orgId, "firm.test");
    await expect(
      saveProvider(auth, database, ownerHeaders, orgId, await config(), BASE, {
        resolveTxt: nothing,
      }),
    ).rejects.toThrow(record.value);
    // Proof for another organisation doesn't count.
    const other = domainProofRecord("another-org", "firm.test");
    await expect(
      saveProvider(auth, database, ownerHeaders, orgId, await config(), BASE, {
        resolveTxt: async () => [[other.value]],
      }),
    ).rejects.toThrow(/Prove you own firm\.test/);
    expect(await anyConfigured(database)).toBe(false);
    expect(record.name).toBe("_dueproof-sso.firm.test");
  });

  it("registers the organisation's provider from the server", async () => {
    const saved = await saveProvider(
      auth,
      database,
      ownerHeaders,
      orgId,
      await config(),
      BASE,
      opts(),
    );
    expect(saved).toMatchObject({
      providerId: providerIdFor(orgId),
      issuer: TEST_IDP.entityId,
      domains: ["firm.test"],
      defaultRole: "viewer",
      acsUrl: `${BASE}/api/auth/sso/saml2/sp/acs/${providerIdFor(orgId)}`,
    });
    expect(await anyConfigured(database)).toBe(true);
    // Saving again replaces it: one provider per organisation.
    await saveProvider(auth, database, ownerHeaders, orgId, await config(), BASE, opts());
    expect(await listProviders(database, orgId, BASE)).toHaveLength(1);
  });

  it("refuses provider management over HTTP, even from an owner", async () => {
    const res = await request("/sso/register", {
      method: "POST",
      cookie: ownerHeaders.get("cookie") ?? "",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        providerId: "rogue",
        issuer: "https://rogue.test",
        domain: "victim.test",
        samlConfig: {
          entryPoint: "https://rogue.test/sso",
          idpMetadata: { entityID: "https://rogue.test" },
        },
      }),
    });
    expect(res.status).toBe(403);
    const list = await request("/sso/providers", { cookie: ownerHeaders.get("cookie") ?? "" });
    expect(list.status).toBe(403);
  });

  it("lets only an SSO endpoint, for the asserting provider's domain, sign someone up", async () => {
    const acs = "/sso/saml2/sp/acs/:providerId";
    const ours = { providerId: providerIdFor(orgId) };
    expect(await allowsSignUp(database, "new@firm.test", acs, ours)).toBe(true);
    expect(await allowsSignUp(database, "new@firm.test", "/sign-up/email", ours)).toBe(false);
    expect(await allowsSignUp(database, "new@other.test", acs, ours)).toBe(false);
    // S1: another organisation's provider can't create accounts on firm.test,
    // and an assertion that names no provider creates none.
    expect(await allowsSignUp(database, "new@firm.test", acs, { providerId: "saml-other" })).toBe(
      false,
    );
    expect(await allowsSignUp(database, "new@firm.test", acs)).toBe(false);
  });
});

describe("SSO sign-in with a mock IdP", () => {
  it("sends the browser to the IdP, accepts its signed assertion and adds the person", async () => {
    const start = await request("/sign-in/sso", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "new.joiner@firm.test", callbackURL: `${BASE}/today` }),
    });
    expect(start.status).toBe(200);
    const { url } = (await start.json()) as { url: string };
    expect(url.startsWith(TEST_IDP.ssoUrl)).toBe(true);
    const redirect = new URL(url);
    expect(redirect.searchParams.get("SAMLRequest")).toBeTruthy();

    // The mock IdP reads the request and answers with a signed assertion.
    const spMeta = await request(
      `/sso/saml2/sp/metadata?providerId=${encodeURIComponent(providerIdFor(orgId))}&format=xml`,
    );
    expect(spMeta.status).toBe(200);
    const sp = samlify.ServiceProvider({ metadata: await spMeta.text() });
    const idp = samlify.IdentityProvider({
      metadata: idpMetadata(),
      privateKey: TEST_IDP.privateKeyPem,
      nameIDFormat: ["urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"],
    });
    const parsed = await idp.parseLoginRequest(sp, "redirect", {
      query: Object.fromEntries(redirect.searchParams),
      octetString: "",
    });
    const response = await idp.createLoginResponse(
      sp,
      parsed as unknown as Parameters<typeof idp.createLoginResponse>[1],
      "post",
      {
        email: "new.joiner@firm.test",
      },
    );
    const form = new URLSearchParams({
      SAMLResponse: response.context,
      RelayState: redirect.searchParams.get("RelayState") ?? "",
    });
    const acs = await request(`/sso/saml2/sp/acs/${providerIdFor(orgId)}`, {
      method: "POST",
      // An IdP POST is cross-site: SameSite=Lax cookies are not sent, so none here.
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    expect(acs.status).toBe(302);
    expect(acs.headers.get("location")).not.toMatch(/error/);
    expect(acs.headers.getSetCookie().join(";")).toMatch(/dueproof\.session_token=/);

    const [joined] = await unsafeRawDb(database)
      .select()
      .from(user)
      .where(eq(user.email, "new.joiner@firm.test"));
    expect(joined).toBeTruthy();
    const m = await getMembership(database, joined?.id ?? "", orgId);
    expect(m?.role).toBe("viewer");
    expect(joins).toEqual([{ orgId, userId: joined?.id, role: "viewer" }]);
    // No organisation of their own.
    expect(await unsafeRawDb(database).select().from(organization)).toHaveLength(1);
  });

  it("stops at the gate when the licence lapses", async () => {
    licensed = false;
    const res = await request("/sign-in/sso", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "someone@firm.test", callbackURL: `${BASE}/today` }),
    });
    expect(res.status).toBe(403);
    licensed = true;
  });

  it("removes the provider for its own organisation only", async () => {
    expect(await removeProvider(database, "another-org", providerIdFor(orgId))).toBe(false);
    expect(await removeProvider(database, orgId, providerIdFor(orgId))).toBe(true);
    expect(await anyConfigured(database)).toBe(false);
  });
});
