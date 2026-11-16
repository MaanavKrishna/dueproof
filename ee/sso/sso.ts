/**
 * SAML single sign-on (08 §1 Business) through Better Auth's SSO plugin.
 *
 * - One identity provider per organisation, set up by an owner or admin in
 *   Settings → Team. The plugin's own provider-management endpoints are
 *   refused over HTTP: providers are registered only by the app's server
 *   action, after `authorize("team.manage")`.
 * - Every SSO endpoint refuses while the licence doesn't include SSO. Owners
 *   keep their password sign-in, so switching SSO off locks nobody out
 *   (08 §5).
 * - Someone signing in through the IdP for the first time may create an
 *   account only if their email is on one of the provider's domains; they
 *   join the provider's organisation with its default role.
 * - Someone who already has a password account keeps using it: the plugin
 *   links an IdP identity to an existing account only when the email is
 *   verified, which v0.1 doesn't do.
 *
 * The provider rows are Better Auth's own table (sso_provider), read here the
 * way packages/auth and apps/app/lib/server/directory.ts read auth tables:
 * filtered by the organisation the caller was authorised for.
 */
import { sso } from "@better-auth/sso";
import { type Database, eq, ssoProvider } from "@dueproof/db";
import { unsafeRawDb } from "@dueproof/db/internal";
import {
  SSO_ROLES,
  type SsoConfig,
  SsoConfigError,
  type SsoExtension,
  type SsoProviderView,
  type SsoRole,
  type SsoRuntime,
} from "@dueproof/plugins";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { parseSsoConfig, providerIdFor, spUrls } from "./config";

/** SSO endpoints a browser or an IdP may call. Everything else under /sso/ is server-only. */
const PUBLIC_PATHS = [
  "/sign-in/sso",
  "/sso/callback",
  "/sso/saml2/sp/acs",
  "/sso/saml2/sp/metadata",
  "/sso/saml2/sp/slo",
  "/sso/saml2/logout",
];

export function isSsoPath(path: string | undefined): boolean {
  return Boolean(path && (path === "/sign-in/sso" || path.startsWith("/sso/")));
}

export function isPublicSsoPath(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

const toRole = (v: unknown): SsoRole =>
  (SSO_ROLES as readonly string[]).includes(String(v)) ? (v as SsoRole) : "member";

const splitDomains = (d: string) =>
  d
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export function ssoAuthPlugins(runtime: SsoRuntime): BetterAuthPlugin[] {
  const gate = {
    id: "dueproof-sso-gate",
    hooks: {
      before: [
        {
          matcher: (ctx: { path?: string }) => isSsoPath(ctx.path),
          handler: createAuthMiddleware(async (ctx) => {
            if (!(await runtime.isLicensed()))
              throw new APIError("FORBIDDEN", {
                message: "Single sign-on needs a Dueproof Business licence.",
              });
            // A request from outside (not the app's own server calls) may
            // only use the sign-in and IdP endpoints.
            if (ctx.request && !isPublicSsoPath(ctx.path))
              throw new APIError("FORBIDDEN", {
                message: "Set up single sign-on in Settings → Team.",
              });
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;

  const plugin = sso({
    // Our own sign-up rules apply (packages/auth externalSignUp): only a
    // configured domain may create an account through the IdP.
    organizationProvisioning: {
      defaultRole: "member",
      getRole: async ({ user, provider }) => {
        const role = toRole((provider as { defaultRole?: unknown }).defaultRole);
        if (provider.organizationId)
          await runtime.onJoin?.({ orgId: provider.organizationId, userId: user.id, role });
        // Better Auth types this as member | admin; our roles are wider.
        return role as "member";
      },
    },
    providersLimit: 1,
    schema: {
      ssoProvider: {
        additionalFields: {
          defaultRole: {
            type: "string",
            required: false,
            defaultValue: "member",
            input: true,
          },
        },
      },
    },
  });
  return [gate, plugin as unknown as BetterAuthPlugin];
}

// ------------------------------------------------------------------ the provider rows

function raw(database: unknown) {
  return unsafeRawDb(database as Database);
}

function view(row: typeof ssoProvider.$inferSelect, appUrl: string): SsoProviderView {
  return {
    providerId: row.providerId,
    issuer: row.issuer,
    domains: splitDomains(row.domain),
    defaultRole: toRole(row.defaultRole),
    ...spUrls(appUrl, row.providerId),
  };
}

export async function listProviders(
  database: unknown,
  orgId: string,
  appUrl: string,
): Promise<SsoProviderView[]> {
  const rows = await raw(database)
    .select()
    .from(ssoProvider)
    .where(eq(ssoProvider.organizationId, orgId));
  return rows.map((r) => view(r, appUrl));
}

export async function removeProvider(
  database: unknown,
  orgId: string,
  providerId: string,
): Promise<boolean> {
  const rows = await raw(database)
    .select({ id: ssoProvider.id, orgId: ssoProvider.organizationId })
    .from(ssoProvider)
    .where(eq(ssoProvider.providerId, providerId));
  const row = rows[0];
  if (!row || row.orgId !== orgId) return false;
  await raw(database).delete(ssoProvider).where(eq(ssoProvider.id, row.id));
  return true;
}

export async function allowsSignUp(
  database: unknown,
  email: string,
  path: string | undefined,
): Promise<boolean> {
  if (!isSsoPath(path)) return false;
  const domain = email.split("@").pop()?.toLowerCase();
  if (!domain) return false;
  const rows = await raw(database)
    .select({ domain: ssoProvider.domain, orgId: ssoProvider.organizationId })
    .from(ssoProvider);
  return rows.some((r) => r.orgId && splitDomains(r.domain).includes(domain));
}

export async function anyConfigured(database: unknown): Promise<boolean> {
  const rows = await raw(database).select({ id: ssoProvider.id }).from(ssoProvider).limit(1);
  return rows.length > 0;
}

/** Another organisation already signs in these domains through its own IdP. */
async function domainsTaken(
  database: unknown,
  orgId: string,
  domains: string[],
): Promise<string[]> {
  const rows = await raw(database)
    .select({ domain: ssoProvider.domain, orgId: ssoProvider.organizationId })
    .from(ssoProvider);
  const taken = new Set(
    rows.filter((r) => r.orgId !== orgId).flatMap((r) => splitDomains(r.domain)),
  );
  return domains.filter((d) => taken.has(d));
}

interface RegisterApi {
  registerSSOProvider(input: { body: Record<string, unknown>; headers: Headers }): Promise<unknown>;
}

export async function saveProvider(
  auth: unknown,
  database: unknown,
  headers: Headers,
  orgId: string,
  config: SsoConfig,
  appUrl: string,
): Promise<SsoProviderView> {
  const clash = await domainsTaken(database, orgId, config.domains);
  if (clash.length > 0)
    throw new SsoConfigError(
      `${clash.join(", ")} already signs in through another organisation's identity provider.`,
    );
  const api = (auth as { api: Partial<RegisterApi> }).api;
  if (typeof api.registerSSOProvider !== "function")
    throw new SsoConfigError("Single sign-on isn't loaded on this server. Restart it.");
  const providerId = providerIdFor(orgId);
  const urls = spUrls(appUrl, providerId);
  // One provider per organisation: replace the earlier one.
  await removeProvider(database, orgId, providerId);
  await api.registerSSOProvider({
    headers,
    body: {
      providerId,
      issuer: config.issuer,
      domain: config.domains.join(","),
      organizationId: orgId,
      defaultRole: config.defaultRole,
      samlConfig: {
        entryPoint: config.entryPoint,
        cert: config.certificates,
        callbackUrl: `${appUrl.replace(/\/$/, "")}/today`,
        idpMetadata: { metadata: config.metadataXml },
        spMetadata: { entityID: urls.spEntityId },
        wantAssertionsSigned: true,
        identifierFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
        mapping: {
          email: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
          firstName: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
          lastName: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
        },
      },
    },
  });
  const saved = (await listProviders(database, orgId, appUrl))[0];
  if (!saved) throw new SsoConfigError("The identity provider wasn't saved. Try again.");
  return saved;
}

export const ssoExtension: SsoExtension = {
  authPlugins: (runtime) => ssoAuthPlugins(runtime),
  allowsSignUp,
  parseConfig: (input, options) => parseSsoConfig(input, options),
  list: listProviders,
  save: saveProvider,
  remove: removeProvider,
  configured: anyConfigured,
};
