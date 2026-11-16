/**
 * The link an invited person opens: the sign-up page with their address
 * filled in. The page only shows the form while a pending invitation for
 * that address exists. Shared by the invitation email, Settings → Team &
 * access and the setup wizard, so all three give the same working link.
 */
export function inviteLink(appUrl: string, email: string): string {
  return `${appUrl.replace(/\/+$/, "")}/sign-up?email=${encodeURIComponent(email)}`;
}
