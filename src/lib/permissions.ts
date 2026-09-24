// REL-01 — Central permission helper for role-gated actions.
//
// Roles: `member`, `release_manager`, `admin`.
// The helper is the single source of truth for "can this user do this?" so API
// routes (server-side enforcement, not just hiding a button) and the chat
// command layer share identical semantics.
//
// The session shape (from next-auth JWT) is `{ user: { role?: string } }`. We
// accept the raw session so the helper is importable from server code without
// a Next dependency.

export type Role = "member" | "release_manager" | "admin";

export const ROLES: Role[] = ["member", "release_manager", "admin"];

export function isKnownRole(role: string | null | undefined): role is Role {
  return role === "member" || role === "release_manager" || role === "admin";
}

/** Extract the effective role from a session (defaults to "member"). */
export function roleOf(session: { user?: { role?: string } } | null | undefined): Role {
  const r = session?.user?.role;
  return isKnownRole(r) ? r : "member";
}

export function isAdminRole(session: { user?: { role?: string } } | null | undefined): boolean {
  return roleOf(session) === "admin";
}

/** A release actor is a release_manager or admin. */
export function isReleaseActor(session: { user?: { role?: string } } | null | undefined): boolean {
  const r = roleOf(session);
  return r === "release_manager" || r === "admin";
}

export type Permission =
  | "release.view"
  | "release.check"
  | "release.manage"
  | "release.approve"
  | "release.publish"
  | "admin.users"
  | "admin.integrations"
  | "branch.view"
  | "branch.confirm"
  | "branch.manage"
  | "branch.sync";

/**
 * Permission matrix (REL-01, BR-005):
 *
 *  | action            | member | release_manager | admin |
 *  |-------------------|--------|-----------------|-------|
 *  | release.view      |  yes   |      yes        |  yes  |
 *  | release.check     |  no    |      yes        |  yes  |
 *  | release.manage    |  no    |      yes        |  yes  |
 *  | release.approve   |  no    |      yes        |  yes  |
 *  | release.publish   |  no    |      yes        |  yes  |
 *  | admin.users       |  no    |      no         |  yes  |
 *  | admin.integrations|  no    |      no         |  yes  |
 *  | branch.view       |  yes   |      yes        |  yes  |
 *  | branch.confirm    |  yes   |      yes        |  yes  |
 *  | branch.manage     |  no    |      yes        |  yes  |
 *  | branch.sync       |  no    |      yes        |  yes  |
 */
export function can(session: { user?: { role?: string } } | null | undefined, perm: Permission): boolean {
  const r = roleOf(session);
  switch (perm) {
    case "release.view":
    case "branch.view":
    case "branch.confirm":
      return true; // any signed-in user
    case "release.check":
    case "release.manage":
    case "release.approve":
    case "release.publish":
    case "branch.manage":
    case "branch.sync":
      return r === "release_manager" || r === "admin";
    case "admin.users":
    case "admin.integrations":
      return r === "admin";
    default:
      return false;
  }
}
