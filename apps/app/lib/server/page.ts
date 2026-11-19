/**
 * For server components (pages and layouts): who is looking, and may they.
 *
 *   const viewer = await requireViewer();               // or redirect to sign-in
 *   const access = await pageAccess("team.manage");     // { ctx } or { denied }
 *
 * Pages still authorise every read through authorize(); this only turns its
 * 401 into a redirect and its 403 into a "no access" state the page renders.
 */
import "server-only";
import type { Role } from "@dueproof/contracts";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { type Action, type AuthContext, authorize } from "../authorize";
import { HttpError } from "../errors";
import { getContainer } from "./container";
import { getOrg, getUser, listMembers } from "./directory";

export interface Viewer {
  userId: string;
  name: string;
  email: string;
  orgId: string;
  orgName: string;
  role: Role;
  edition: "self-hosted" | "hosted" | "desktop";
  setupDone: boolean;
}

/** Where to come back to after signing in (set by proxy.ts). */
export async function currentPath(): Promise<string> {
  const p = (await headers()).get("x-pathname") ?? "/";
  return p.startsWith("/") && !p.startsWith("//") ? p : "/";
}

export function signInUrl(next: string): string {
  return next && next !== "/" ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in";
}

// Control characters (C0, DEL, C1), any whitespace (URL parsers strip tabs
// and newlines) and backslashes (browsers read "\\" as "/").
function hasUnsafeChar(p: string): boolean {
  for (const ch of p) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0x20 || (code >= 0x7f && code <= 0xa0) || ch === "\\" || /\s/u.test(ch))
      return true;
  }
  return false;
}
const PROBE_ORIGIN = "https://dueproof.invalid";

function plainPath(p: string): boolean {
  return p.startsWith("/") && !p.startsWith("//") && !hasUnsafeChar(p);
}

/**
 * Only same-site paths are followed after sign-in (L1). The path must start
 * with one slash and hold no control characters, whitespace or backslashes,
 * before and after percent-decoding; it must then resolve to this origin.
 * Returns the resolved path, query and hash.
 */
export function safeNext(next: string | null | undefined, fallback = "/today"): string {
  if (typeof next !== "string" || next.length > 2048 || !plainPath(next)) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return fallback;
  }
  if (!plainPath(decoded)) return fallback;
  let url: URL;
  try {
    url = new URL(next, PROBE_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PROBE_ORIGIN) return fallback;
  const path = `${url.pathname}${url.search}${url.hash}`;
  return plainPath(path) ? path : fallback;
}

export async function getViewer(): Promise<Viewer | null> {
  let ctx: AuthContext;
  try {
    ctx = await authorize("team.view");
  } catch (e) {
    if (e instanceof HttpError && (e.status === 401 || e.status === 403)) return null;
    throw e;
  }
  const { database, env } = ctx.container;
  const [user, org] = await Promise.all([
    getUser(database, ctx.userId),
    getOrg(database, ctx.orgId),
  ]);
  return {
    userId: ctx.userId,
    name: user?.name ?? "",
    email: user?.email ?? "",
    orgId: ctx.orgId,
    orgName: org?.name ?? "",
    role: ctx.role,
    edition: env.DUEPROOF_EDITION,
    setupDone: Boolean(
      org?.metadata.onboarding.completedAt || org?.metadata.onboarding.dismissedAt,
    ),
  };
}

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(signInUrl(await currentPath()));
  return viewer;
}

/** The Settings page's title line and which sections to show. */
export async function settingsChrome(viewer: Viewer) {
  const members = await listMembers((await getContainer()).database, viewer.orgId);
  return {
    orgName: viewer.orgName,
    members: members.length,
    edition: viewer.edition,
    isAdmin: viewer.role === "owner" || viewer.role === "admin",
  };
}

export type PageAccess =
  | { ok: true; ctx: AuthContext }
  | { ok: false; reason: "forbidden"; admins: string[] };

/** authorize() for a page: signed out → sign-in; not allowed → names who can help. */
export async function pageAccess(action: Action): Promise<PageAccess> {
  try {
    return { ok: true, ctx: await authorize(action) };
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    if (e.status === 401) redirect(signInUrl(await currentPath()));
    if (e.status === 403) {
      const viewer = await getViewer();
      const admins = viewer
        ? (await listMembers((await getContainer()).database, viewer.orgId))
            .filter((m) => m.role === "owner" || m.role === "admin")
            .map((m) => m.name)
        : [];
      return { ok: false, reason: "forbidden", admins };
    }
    throw e;
  }
}
