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
    // idp.test stands for a public IdP.
    const lookup = async () => ["8.8.8.8"];
    const c = await parseSsoConfig(
      { metadataUrl: "https://idp.test/metadata", domains: "firm.test" },
      { fetch: fake, lookup },
    );
    expect(c.defaultRole).toBe("member");
    await expect(
      parseSsoConfig(
        { metadataUrl: "http://idp.test/metadata", domains: "firm.test" },
        { fetch: fake, lookup },
      ),
    ).rejects.toThrow(/https/);
    // S2: a refusal says the same whatever happened, so it can't probe hosts.
    const notFound = (async () => new Response("", { status: 404 })) as typeof fetch;
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const answers: string[] = [];
    for (const f of [notFound, down]) {
      const e = await parseSsoConfig(
        { metadataUrl: "https://idp.test/x", domains: "firm.test" },
        { fetch: f, lookup },
      ).catch((err: Error) => err);
      answers.push((e as Error).message);
    }
    expect(answers[0]).toBe(answers[1]);
    expect(answers[0]).not.toMatch(/404/);
    // A body larger than the cap is cut off, with or without a length header.
    const huge = (async () => new Response("x".repeat(200_000))) as typeof fetch;
    await expect(
      parseSsoConfig(
        { metadataUrl: "https://idp.test/x", domains: "firm.test" },
        { fetch: huge, lookup },
      ),
    ).rejects.toThrow(/100 KB/);
    const streamed = (async () =>
      new Response(
        new ReadableStream({
          start(c) {
            for (let i = 0; i < 20; i++) c.enqueue(new Uint8Array(10_000));
            c.close();
          },
        }),
      )) as typeof fetch;
    await expect(
      parseSsoConfig(
        { metadataUrl: "https://idp.test/x", domains: "firm.test" },
        { fetch: streamed, lookup },
      ),
    ).rejects.toThrow(/100 KB/);
  });

  it("never fetches from a private or internal address (S2)", async () => {
    let fetched = 0;
    const fake = (async () => {
      fetched++;
      return new Response(idpMetadata(), { status: 200 });
    }) as typeof fetch;
    const internal = async (host: string) => (host === "idp.internal.test" ? ["10.0.0.7"] : []);
    const messages = new Set<string>();
    for (const url of [
      "https://127.0.0.1/metadata",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/metadata",
      "https://[::ffff:192.168.1.1]/metadata",
      "https://localhost/metadata",
      "https://idp.internal.test/metadata",
      "https://unresolvable.test/metadata",
    ]) {
      const e = await parseSsoConfig(
        { metadataUrl: url, domains: "firm.test" },
        { fetch: fake, lookup: internal },
      ).catch((err: Error) => err);
      expect(e, url).toBeInstanceOf(Error);
      messages.add((e as Error).message);
    }
    expect(fetched).toBe(0);
    expect(messages.size).toBe(1);
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
