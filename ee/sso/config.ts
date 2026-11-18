/**
 * Settings → Team → Single sign-on: the form an admin fills in, checked
 * before anything is registered. The IdP metadata comes as a URL (fetched
 * once, now, over https, size-capped, to a public address only, with one
 * plain error whatever went wrong: S2) or as pasted XML. From it we take
 * the IdP's entity ID, its single sign-on URL and its signing certificates.
 */
import { createHash } from "node:crypto";
import {
  SSO_ROLES,
  type SsoConfig,
  SsoConfigError,
  type SsoProviderView,
  type SsoRole,
} from "@dueproof/plugins";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { isPublicHost, type Lookup } from "./net";

export const MAX_METADATA_BYTES = 100 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

/** Personal-mail domains: never a firm's SSO domain. */
const PUBLIC_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "yahoo.co.in",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  "rediffmail.com",
  "zoho.com",
]);

const DOMAIN = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export const SsoForm = z
  .object({
    metadataUrl: z.string().trim().max(2000).optional(),
    metadataXml: z.string().trim().max(MAX_METADATA_BYTES).optional(),
    domains: z.string().trim().min(1, "Enter your email domain, like firm.in.").max(1000),
    defaultRole: z.enum(SSO_ROLES as unknown as [SsoRole, ...SsoRole[]]).default("member"),
  })
  .strict();
export type SsoForm = z.input<typeof SsoForm>;

export function parseDomains(text: string): string[] {
  const domains = [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
        .filter(Boolean),
    ),
  ];
  if (domains.length === 0) throw new SsoConfigError("Enter your email domain, like firm.in.");
  if (domains.length > 10) throw new SsoConfigError("Use at most 10 domains.");
  for (const d of domains) {
    if (!DOMAIN.test(d)) throw new SsoConfigError(`"${d}" isn't a domain. Use one like firm.in.`);
    if (PUBLIC_MAIL.has(d))
      throw new SsoConfigError(
        `${d} is a personal mail service. Use the domain your firm's email is on.`,
      );
  }
  return domains;
}

type XmlNode = Record<string, unknown>;
const asArray = <T>(v: T | T[] | undefined): T[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];
const attr = (node: unknown, name: string): string | undefined => {
  const v = (node as XmlNode | undefined)?.[`@_${name}`];
  return typeof v === "string" ? v : undefined;
};
const text = (node: unknown): string | undefined =>
  typeof node === "string"
    ? node
    : typeof node === "object" && node
      ? ((node as XmlNode)["#text"] as string | undefined)
      : undefined;

function toPem(base64: string): string {
  const body = base64.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----\n`;
}

const POST = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST";
const REDIRECT = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect";

/** The parts of IdP metadata we use. Throws SsoConfigError with a plain message. */
export function readIdpMetadata(xml: string): {
  entityId: string;
  entryPoint: string;
  certificates: string[];
} {
  if (Buffer.byteLength(xml, "utf8") > MAX_METADATA_BYTES)
    throw new SsoConfigError("That metadata is larger than 100 KB.");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new SsoConfigError("That metadata declares a DOCTYPE, which isn't allowed.");
  let doc: XmlNode;
  try {
    doc = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
      processEntities: false,
    }).parse(xml) as XmlNode;
  } catch {
    throw new SsoConfigError("That isn't valid XML. Download the metadata file again.");
  }
  const roots = [
    ...asArray(doc.EntityDescriptor as XmlNode | XmlNode[] | undefined),
    ...asArray(
      (doc.EntitiesDescriptor as XmlNode | undefined)?.EntityDescriptor as
        | XmlNode
        | XmlNode[]
        | undefined,
    ),
  ];
  const entity = roots.find((e) => e.IDPSSODescriptor);
  if (!entity)
    throw new SsoConfigError(
      "That isn't identity provider metadata: it has no IDPSSODescriptor. Use the IdP's federation metadata, not the app's.",
    );
  const entityId = attr(entity, "entityID");
  if (!entityId) throw new SsoConfigError("The metadata has no entityID.");
  if (!z.url().safeParse(entityId).success)
    throw new SsoConfigError("The IdP's entityID must be a URL, like https://idp.example.com/.");
  const idp = asArray(entity.IDPSSODescriptor as XmlNode | XmlNode[])[0] as XmlNode;
  const services = asArray(idp.SingleSignOnService as XmlNode | XmlNode[] | undefined);
  const service =
    services.find((s) => attr(s, "Binding") === REDIRECT) ??
    services.find((s) => attr(s, "Binding") === POST);
  const entryPoint = attr(service, "Location");
  if (!entryPoint || !/^https:\/\//.test(entryPoint))
    throw new SsoConfigError(
      "The metadata has no https single sign-on URL (HTTP-Redirect or HTTP-POST binding).",
    );
  const certificates = asArray(idp.KeyDescriptor as XmlNode | XmlNode[] | undefined)
    .filter((k) => {
      const use = attr(k, "use");
      return use === undefined || use === "signing";
    })
    .flatMap((k) =>
      asArray(
        ((k.KeyInfo as XmlNode | undefined)?.X509Data as XmlNode | undefined)?.X509Certificate,
      ),
    )
    .map(text)
    .filter((c): c is string => Boolean(c?.trim()))
    .map(toPem);
  if (certificates.length === 0)
    throw new SsoConfigError(
      "The metadata has no signing certificate, so sign-ins couldn't be checked.",
    );
  return { entityId, entryPoint, certificates: [...new Set(certificates)] };
}

/** One answer for every fetch failure (S2): it mustn't tell internal hosts apart. */
const COULD_NOT_FETCH =
  "Couldn't get metadata from that URL. Check it's the IdP's public metadata URL, or paste the XML instead.";

/** The body, read up to the cap and no further. */
async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_METADATA_BYTES) {
      await reader.cancel().catch(() => {});
      throw new SsoConfigError("That metadata is larger than 100 KB.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function fetchMetadata(
  url: string,
  fetchImpl: typeof fetch,
  lookup: Lookup | undefined,
): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SsoConfigError("That metadata URL isn't a URL.");
  }
  if (parsed.protocol !== "https:")
    throw new SsoConfigError("The metadata URL must start with https://.");
  if (parsed.username || parsed.password) throw new SsoConfigError(COULD_NOT_FETCH);
  // Public addresses only: never the server's own network or a metadata service.
  if (!(await isPublicHost(parsed.hostname, lookup))) throw new SsoConfigError(COULD_NOT_FETCH);
  // One deadline for the whole exchange, body included.
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(parsed, {
      redirect: "error",
      signal,
      headers: { accept: "application/samlmetadata+xml, application/xml, text/xml" },
    });
    if (!res.ok) throw new SsoConfigError(COULD_NOT_FETCH);
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > MAX_METADATA_BYTES)
      throw new SsoConfigError("That metadata is larger than 100 KB.");
    return await readCapped(res);
  } catch (e) {
    if (e instanceof SsoConfigError) throw e;
    throw new SsoConfigError(COULD_NOT_FETCH);
  }
}

/** Validates the Settings form into a config ready to register. */
export async function parseSsoConfig(
  input: unknown,
  options: { fetch?: typeof fetch; lookup?: Lookup } = {},
): Promise<SsoConfig> {
  const parsed = SsoForm.safeParse(input);
  if (!parsed.success)
    throw new SsoConfigError(parsed.error.issues[0]?.message ?? "Check the single sign-on form.");
  const form = parsed.data;
  const domains = parseDomains(form.domains);
  let xml = form.metadataXml || "";
  if (!xml) {
    if (!form.metadataUrl)
      throw new SsoConfigError("Give the IdP's metadata URL, or paste its metadata XML.");
    xml = await fetchMetadata(form.metadataUrl, options.fetch ?? fetch, options.lookup);
  }
  const meta = readIdpMetadata(xml);
  return {
    issuer: meta.entityId,
    entryPoint: meta.entryPoint,
    domains,
    defaultRole: form.defaultRole,
    metadataXml: xml,
    certificates: meta.certificates,
  };
}

/**
 * Proof of domain ownership (S1): before an identity provider may create
 * accounts for a domain, the domain must publish this TXT record. The value
 * is tied to the organisation, so only whoever controls the domain's DNS can
 * hand the domain to an organisation.
 */
export function domainProofRecord(orgId: string, domain: string): { name: string; value: string } {
  const digest = createHash("sha256").update(`dueproof-sso:${orgId}`).digest("hex").slice(0, 32);
  return { name: `_dueproof-sso.${domain}`, value: `dueproof-sso-verification=${digest}` };
}

/** One SAML provider per organisation; its id is derived from the organisation's. */
export function providerIdFor(orgId: string): string {
  return `saml-${orgId}`;
}

export function spUrls(
  appUrl: string,
  providerId: string,
): Pick<SsoProviderView, "acsUrl" | "spEntityId"> {
  const base = `${appUrl.replace(/\/$/, "")}/api/auth`;
  return {
    acsUrl: `${base}/sso/saml2/sp/acs/${providerId}`,
    spEntityId: `${base}/sso/saml2/sp/metadata?providerId=${encodeURIComponent(providerId)}`,
  };
}
