import { SsoConfigError } from "@dueproof/plugins";
import { describe, expect, it } from "vitest";
import { parseDomains, parseSsoConfig, providerIdFor, readIdpMetadata, spUrls } from "./config";
import { idpMetadata, TEST_IDP } from "./test-idp/fixture";

describe("SSO domains", () => {
  it("normalises a list", () => {
    expect(parseDomains(" Firm.in, @branch.firm.in;firm.in ")).toEqual([
      "firm.in",
      "branch.firm.in",
    ]);
  });

  it("refuses things that aren't domains, and personal mail", () => {
    expect(() => parseDomains("not a domain")).toThrow(SsoConfigError);
    expect(() => parseDomains("gmail.com")).toThrow(/personal mail/);
    expect(() => parseDomains("")).toThrow(/Enter your email domain/);
    expect(() => parseDomains(Array.from({ length: 11 }, (_, i) => `d${i}.in`).join(","))).toThrow(
      /at most 10/,
    );
  });
});

describe("IdP metadata", () => {
  it("reads the entity ID, the sign-on URL and the signing certificate", () => {
    const m = readIdpMetadata(idpMetadata());
    expect(m.entityId).toBe(TEST_IDP.entityId);
    expect(m.entryPoint).toBe(TEST_IDP.ssoUrl);
    expect(m.certificates).toHaveLength(1);
    expect(m.certificates[0]).toMatch(/^-----BEGIN CERTIFICATE-----\n/);
  });

  it("reads metadata wrapped in EntitiesDescriptor (Azure AD federation metadata)", () => {
    const wrapped = `<EntitiesDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata">${idpMetadata().replace(/^<\?xml[^>]*>/, "")}</EntitiesDescriptor>`;
    expect(readIdpMetadata(wrapped).entityId).toBe(TEST_IDP.entityId);
  });

  it("explains what's wrong with bad metadata", () => {
    expect(() => readIdpMetadata("<oops")).toThrow(SsoConfigError);
    expect(() =>
      readIdpMetadata(`<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><x/>`),
    ).toThrow(/DOCTYPE/);
    expect(() =>
      readIdpMetadata(
        `<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://sp"><SPSSODescriptor/></EntityDescriptor>`,
      ),
    ).toThrow(/IDPSSODescriptor/);
    expect(() => readIdpMetadata(idpMetadata({ withCert: false }))).toThrow(/signing certificate/);
    expect(() => readIdpMetadata(idpMetadata({ ssoUrl: "http://idp.test/sso" }))).toThrow(/https/);
  });
});

describe("the Settings form", () => {
  it("accepts pasted XML", async () => {
    const c = await parseSsoConfig({
      metadataXml: idpMetadata(),
      domains: "firm.test",
      defaultRole: "viewer",
    });
    expect(c).toMatchObject({
      issuer: TEST_IDP.entityId,
      entryPoint: TEST_IDP.ssoUrl,
      domains: ["firm.test"],
      defaultRole: "viewer",
    });
  });

  it("fetches a metadata URL over https only", async () => {
    const fake = (async () => new Response(idpMetadata(), { status: 200 })) as typeof fetch;
    const c = await parseSsoConfig(
      { metadataUrl: "https://idp.test/metadata", domains: "firm.test" },
      { fetch: fake },
    );
    expect(c.defaultRole).toBe("member");
    await expect(
      parseSsoConfig(
        { metadataUrl: "http://idp.test/metadata", domains: "firm.test" },
        { fetch: fake },
      ),
    ).rejects.toThrow(/https/);
    const notFound = (async () => new Response("", { status: 404 })) as typeof fetch;
    await expect(
      parseSsoConfig(
        { metadataUrl: "https://idp.test/x", domains: "firm.test" },
        { fetch: notFound },
      ),
    ).rejects.toThrow(/404/);
    const huge = (async () => new Response("x".repeat(200_000))) as typeof fetch;
    await expect(
      parseSsoConfig({ metadataUrl: "https://idp.test/x", domains: "firm.test" }, { fetch: huge }),
    ).rejects.toThrow(/100 KB/);
  });

  it("needs metadata, and refuses owner as a default role", async () => {
    await expect(parseSsoConfig({ domains: "firm.test" })).rejects.toThrow(/metadata/);
    await expect(
      parseSsoConfig({ metadataXml: idpMetadata(), domains: "firm.test", defaultRole: "owner" }),
    ).rejects.toThrow(SsoConfigError);
  });

  it("gives the admin the URLs to paste into their IdP", () => {
    const id = providerIdFor("org_1");
    expect(spUrls("https://dueproof.firm.test/", id)).toEqual({
      acsUrl: "https://dueproof.firm.test/api/auth/sso/saml2/sp/acs/saml-org_1",
      spEntityId: "https://dueproof.firm.test/api/auth/sso/saml2/sp/metadata?providerId=saml-org_1",
    });
  });
});
