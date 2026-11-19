/**
 * The link an invited person opens: the sign-up page with the invitation's
 * token (H1). The token is a secret, `<invitation id>.<HMAC>` keyed from
 * AUTH_SECRET, so knowing someone's address is not enough to take their
 * place. The page shows the invitation, and sign-up joins it, only with a
 * token for a pending, unexpired invitation; the address must match, and the
 * invitation is used up on joining. Shared by the invitation email,
 * Settings → Team & access and the setup wizard, so all three give the same
 * working link. Never log it.
 */
import "server-only";
import { inviteToken } from "@dueproof/auth";

export function inviteLink(appUrl: string, secret: string, invitationId: string): string {
  const token = inviteToken(secret, invitationId);
  return `${appUrl.replace(/\/+$/, "")}/sign-up?invite=${encodeURIComponent(token)}`;
}
