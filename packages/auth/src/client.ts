/**
 * Browser-side auth client for the UI lanes: sign-in/up, passkeys, TOTP and
 * organisation calls against /api/auth. Import from "@dueproof/auth/client".
 */
import { passkeyClient } from "@better-auth/passkey/client";
import { organizationClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { ac, roles } from "./roles";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [organizationClient({ ac, roles }), twoFactorClient(), passkeyClient()],
});
