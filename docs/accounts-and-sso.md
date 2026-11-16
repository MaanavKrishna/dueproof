# Accounts and sign-in

Dueproof v0.1 keeps its own accounts (Better Auth, in the same Postgres
database as everything else). People sign in with a password, a passkey, or
single sign-on on the Business edition.

## Who can sign up

`AUTH_SIGNUP` decides. Its default depends on the edition.

| `AUTH_SIGNUP` | Default for | What happens |
|---|---|---|
| `first-user` | self-hosted, desktop | The first person to sign up creates the organisation and becomes its **owner**, then goes to the setup wizard. After that, only addresses with a pending invitation can sign up |
| `open` | hosted | Anyone can sign up. Someone with a pending invitation joins that organisation; anyone else gets a new organisation as its owner |

Someone without an invitation on a `first-user` install sees **Sign-up is by
invitation**, which tells them to ask an administrator for an invite link.

## Inviting people

Owners and admins invite from **Settings → Team & access → Invite people**
(or the setup wizard's **Invite your team** step): email addresses and a
role.

Each person gets an invitation email through the install's mail settings
(`MAIL_DRIVER`, see [Configuration](configuration.md#reminders-and-email)).
It carries their sign-up link, `/sign-up?email=<their address>`. The page
names your organisation and the role, with the address filled in.

The same link is shown in the setup wizard after you invite, and under
**Invitations** in **Team & access** (the copy button beside each address).
Use it when the install has no mail server (`MAIL_DRIVER=log` sends
nothing) or an email went astray: copy it and send it yourself.

Plain `/sign-up` without an invited address shows **Sign-up is by
invitation** and asks the person to get an invite link from an
administrator. Invitations last 14 days; cancel one from the same list.

## Roles

| Role | Can |
|---|---|
| Owner | Everything, including the licence. The first account is the owner |
| Admin | Manages people and settings |
| Manager | Assigns work, approves replies |
| Member | Works on notices |
| Viewer | Reads only |

Owners, admins and managers may approve replies by default. Turn **Approves
replies** on or off per person in **Team & access**. Nobody can approve a
reply they asked approval for, and a viewer never can.

An owner or admin can limit a person to **Only these clients**. They then
see and work on those clients' notices and deadlines only. Owners and admins
always see every client.

Removing someone takes their access away at once. Their work, comments and
audit entries stay.

## Passwords

At least 10 characters (at most 256), stored as Argon2id hashes. Sign-in is
limited to 20 attempts per 15 minutes from one address, and sign-up to 3 an
hour.

**Forgot your password?** emails a reset link through the install's mail
settings. The page gives the same answer whether or not the account exists.
The link works once, for one hour, and choosing a new password signs out
every other session.

An owner or admin can also send a member a reset link: in **Team &
access**, open the **⋯** menu beside the person and choose **Email a
password reset link**. Only the member's inbox gets the link; the
administrator never sees it. Only an owner can send one to another owner,
and you reset your own password from the sign-in page.

Reset emails need a mail server. With `MAIL_DRIVER=log` nothing is sent:
the admin action says so, and a passkey added beforehand is the way back
in.

## Passkeys

In **Settings → Me → Passkeys**, add a passkey on each device you use
(fingerprint, face or device PIN). Then choose **Sign in with a passkey**.
A passkey is tied to the address Dueproof is served from (`APP_URL`), so a
change of domain means adding passkeys again.

## Two-step verification

In **Settings → Me → Two-step verification**, turn on a code from an
authenticator app. You get backup codes once: keep them. The code is asked
for when you sign in with a password; a passkey doesn't need it.

## Sessions

A session lasts 7 days and is renewed once a day while you use it. The
cookie is HttpOnly, SameSite=Lax, and Secure whenever `APP_URL` starts with
`https://`. Every request that changes something must come from the app's
own origin (or one in `AUTH_TRUSTED_ORIGINS`, such as the desktop app).

## Single sign-on (Business)

SAML single sign-on comes with the **Business** edition: the build that
includes `ee/` and a licence with the `sso` feature. An owner installs the
licence in **Settings → System → Licence** (it is checked on the server,
offline).

Then, in **Settings → Team & access → Single sign-on**:

1. Give your identity provider the **ACS (reply) URL** and the **Entity ID
   (audience)** shown there, and have it send the email address as the
   NameID.
2. Enter the **IdP metadata URL**, or paste the **IdP metadata XML**.
3. Enter your **Email domains**.

It is written for SAML providers such as Microsoft Entra ID, Google
Workspace and Okta.

- One identity provider per organisation.
- Someone signing in through it for the first time gets an account only if
  their address is on one of those domains. They join with the provider's
  default role.
- People who already have a password account keep using it: v0.1 doesn't
  link an identity provider to an existing account.
- **Owners keep their password**, so turning SSO off, or a lapsed licence,
  locks nobody out. When a licence lapses (after 30 days' grace), SSO stops; nothing is
  deleted.

The sign-in page shows **Continue with SSO** only when SSO is set up.

## What is protected

Every page and every API route checks who you are and what your role allows
before it does anything, and every database query runs inside your
organisation. The exceptions hold no data or use their own secret:
`/api/health`, `/api/metrics` (local or `METRICS_TOKEN`), `/api/cron/daily`
(`CRON_SECRET`), calendar feeds (a signed link you can revoke) and the
storage links (signed, under 5 minutes).

See also [Security](security.md).
