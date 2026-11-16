/** TEST ONLY: a mock SAML identity provider's metadata, from the TEST certificate here. */
import { readFileSync } from "node:fs";

const read = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

export const TEST_IDP = {
  entityId: "https://idp.firm.test/saml",
  ssoUrl: "https://idp.firm.test/saml/sso",
  certPem: read("idp.TEST.cert.pem"),
  privateKeyPem: read("idp.TEST.private.pem"),
};

const certBody = (pem: string) =>
  pem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");

export function idpMetadata(
  options: { withCert?: boolean; ssoUrl?: string; entityId?: string } = {},
): string {
  const cert =
    options.withCert === false
      ? ""
      : `<md:KeyDescriptor use="signing"><ds:KeyInfo><ds:X509Data><ds:X509Certificate>${certBody(TEST_IDP.certPem)}</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor>`;
  return `<?xml version="1.0" encoding="UTF-8"?><md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" entityID="${options.entityId ?? TEST_IDP.entityId}"><md:IDPSSODescriptor WantAuthnRequestsSigned="false" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">${cert}<md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat><md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="${options.ssoUrl ?? TEST_IDP.ssoUrl}"/><md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${options.ssoUrl ?? TEST_IDP.ssoUrl}"/></md:IDPSSODescriptor></md:EntityDescriptor>`;
}
