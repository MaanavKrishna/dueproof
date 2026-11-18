/**
 * Invitation tokens (H1). An invitation link carries a secret, not just an
 * address: `<invitation id>.<HMAC-SHA256 of the id>`, keyed from the auth
 * secret. Nothing new is stored: the token is recomputed from the
 * invitation row, so cancelling, replacing, accepting or expiring the row
 * is what revokes the link. Knowing an invited address is not enough to
 * sign up as that person, and the token is never logged.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, gt, invitation, organization, sql } from "@dueproof/db";
import type { AnyPgDatabase } from "@dueproof/db/internal";

function key(secret: string): Buffer {
  return createHmac("sha256", secret).update("dueproof:invitation:v1").digest();
}

function mac(secret: string, invitationId: string): Buffer {
  return createHmac("sha256", key(secret)).update(invitationId).digest();
}

/** The token for an invitation's link. */
export function inviteToken(secret: string, invitationId: string): string {
  return `${invitationId}.${mac(secret, invitationId).toString("base64url")}`;
}

/** The invitation id a token was made for, or null when it isn't one of ours. */
export function invitationIdFromToken(secret: string, token: unknown): string | null {
  if (typeof token !== "string" || token.length > 200) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  const given = token.slice(dot + 1);
  if (!/^[\w-]{1,100}$/.test(id) || !/^[\w-]{43}$/.test(given)) return null;
  const want = mac(secret, id);
  const got = Buffer.from(given, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  return id;
}

export interface OpenInvitation {
  id: string;
  organizationId: string;
  orgName: string;
  email: string;
  role: string | null;
  expiresAt: Date;
}

/**
 * The pending, unexpired invitation a token opens, or null. With `email`,
 * the invitation must also be for that address (case-insensitive).
 */
export async function openInvitation(
  raw: AnyPgDatabase,
  secret: string,
  token: unknown,
  email?: string,
): Promise<OpenInvitation | null> {
  const id = invitationIdFromToken(secret, token);
  if (!id) return null;
  const [row] = await raw
    .select({
      id: invitation.id,
      organizationId: invitation.organizationId,
      orgName: organization.name,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .where(
      and(
        eq(invitation.id, id),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, new Date()),
        ...(email === undefined ? [] : [sql`lower(${invitation.email}) = lower(${email})`]),
      ),
    )
    .limit(1);
  return row ?? null;
}
