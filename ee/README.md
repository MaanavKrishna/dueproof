# ee/ — Dueproof Business features

Proprietary code under a commercial licence ([`ee/LICENSE`](LICENSE), a
draft until a lawyer reviews it). Everything outside this directory is
under the PolyForm Shield License 1.0.0 and never imports it (AGENTS rule 12).

| Folder          | Feature                                                                       | Licence feature |
| --------------- | ----------------------------------------------------------------------------- | --------------- |
| `licence/`      | Offline licence keys: Ed25519-signed file, verified without any network call  | —               |
| `sso/`          | SAML single sign-on through Better Auth's SSO plugin                          | `sso`           |
| `audit-export/` | The audit trail as JSONL or CSV with its hash chain and a verification report | `audit-export`  |
| `white-label/`  | Reports with only your logo and name                                          | `white-label`   |

## How the app finds it

The app imports `@dueproof/ee-entry`. That name resolves to `ee/index.ts`
when this directory exists, and to `apps/app/lib/ee-absent.ts` (which
exports `ee = null`) when it doesn't, or when `DUEPROOF_EE=off`:

- TypeScript: `apps/app/lib/ee-entry.d.ts` declares the module's shape, so
  the app typechecks the same either way; ee/ typechecks itself.
- Next.js: `turbopack.resolveAlias` in `apps/app/next.config.ts`.
- Vitest: `resolve.alias` in `apps/app/vitest.config.ts`.

The contract is `@dueproof/plugins` (`EePlugin`). Delete `ee/` and the app
builds, runs and passes its tests as Self-hosted Free; CI checks this.

## Licence files

```json
{
  "dueproofLicence": 1,
  "keyId": "dueproof-2027",
  "payload": "{\"v\":1,\"licenceId\":\"lic_…\",\"licensee\":\"…\",\"orgName\":\"…\",\"features\":[\"sso\",\"audit-export\",\"white-label\"],\"seats\":25,\"issuedAt\":\"…\",\"expiresAt\":\"…\"}",
  "signature": "<base64 Ed25519 over \"dueproof-licence-v1\\n\" + payload>"
}
```

- Checked at every use, offline. No activation server, no phone-home.
- Banner from 30 days before expiry; 30 days of grace after it; then the
  Business features switch off. Nothing is deleted, and no licence state can
  block reading, proving, deadlines, export or backup.
- A server clock set more than a day behind the latest audit entry counts
  as expired.
- Features this build doesn't know are kept and shown, never switched on.
- The test key in `licence/test-keys` is trusted only under `NODE_ENV=test`,
  or with `DUEPROOF_LICENCE_TEST_KEYS=1` outside production.

### Issuing one

```sh
# once: the signing key pair. Keep the private key offline; *.private.pem is git-ignored.
pnpm --filter @dueproof/ee licence keygen --out ~/dueproof-licence-keys --id dueproof-2027
# paste ~/dueproof-licence-keys/dueproof-2027.public.pem into ee/licence/keys.ts (PRODUCTION_KEYS)

# per customer, after payment
pnpm --filter @dueproof/ee licence issue \
  --key ~/dueproof-licence-keys/dueproof-2027.private.pem --key-id dueproof-2027 \
  --licensee "Sharma & Co" --org "Sharma & Co Chartered Accountants" \
  --features sso,audit-export,white-label --seats 25 --days 365 \
  --out sharma-and-co.dueproof-licence

# check a file
pnpm --filter @dueproof/ee licence verify --file sharma-and-co.dueproof-licence
```

The customer pastes or uploads the file in Settings → System → Licence.

## Single sign-on: setting up the identity provider

In Dueproof, Settings → Team → Single sign-on shows two values to give your
IdP. With `APP_URL=https://dueproof.firm.in` and organisation id `<org>`:

- **ACS (reply) URL:** `https://dueproof.firm.in/api/auth/sso/saml2/sp/acs/saml-<org>`
- **Entity ID (identifier, audience):** `https://dueproof.firm.in/api/auth/sso/saml2/sp/metadata?providerId=saml-<org>`

Send the email address as the NameID (format `emailAddress`). Assertions
must be signed. Then paste the IdP's metadata URL (or its XML) into
Dueproof with your email domain and the role new people get (viewer,
member or manager; owners and admins are made in Settings → Team).

**Microsoft Entra ID (Azure AD).** Enterprise applications → New
application → Create your own (non-gallery) → Single sign-on → SAML.
Identifier = the Entity ID above; Reply URL = the ACS URL. Under
Attributes & Claims set the Unique User Identifier to `user.mail` with
name format Email address. Assign users or groups. Copy the **App
Federation Metadata Url** into Dueproof.

**Google Workspace.** Admin console → Apps → Web and mobile apps → Add app
→ Add custom SAML app. Download the IdP metadata (or copy the SSO URL and
certificate into a metadata file). ACS URL and Entity ID as above; Name ID
format EMAIL, Name ID = Basic Information › Primary email. Turn the app on
for the right organisational units. Paste the downloaded XML into Dueproof.

**Okta.** Applications → Create App Integration → SAML 2.0. Single sign-on
URL = the ACS URL (use it for Recipient and Destination); Audience URI =
the Entity ID. Name ID format EmailAddress; Application username Email.
Assign people. Copy the **Metadata URL** from the Sign On tab into Dueproof.

What happens at sign-in:

- The sign-in page shows **Continue with SSO** once an organisation on the
  server has set it up and the licence includes SSO.
- Someone new whose email is on your domain gets an account and joins with
  the default role. Someone with an email on another domain is refused.
- People who already have a Dueproof password keep signing in with it.
  Linking an existing account to the IdP needs verified emails, which v0.1
  doesn't have yet.
- If the licence lapses, the SSO endpoints refuse and people sign in with
  passwords; the owner always keeps theirs.

## Audit export

Settings → System → Audit export (owner or admin, with the `audit-export`
feature): pick a date range and download JSONL or CSV, plus a verification
report. Each download writes an audit entry. The report explains how an
auditor checks the file without Dueproof; `verifyAuditExport()` in
`audit-export/audit-export.ts` does the same in code.

## Tests

`pnpm --filter @dueproof/ee test` — licence verification (valid, tampered,
expired, grace, wrong key, clock), SSO config validation and a full SAML
round trip against a mock IdP (samlify with the TEST certificate in
`sso/test-idp`), and audit export chain verification.
