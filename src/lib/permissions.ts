// REL-01 — Central permission helper for role-gated actions.
//
// Roles: `member`, `lead`, `release_manager`, `admin`.
// The helper is the single source of truth for "can this user do this?" so API
// routes (server-side enforcement, not just hiding a button) and the chat
// command layer share identical semantics.
//
// The session shape (from next-auth JWT) is `{ user: { role?: string } }`. We
// accept the raw session so the helper is importable from server code without
// a Next dependency.

export type Role = "member" | "lead" | "release_manager" | "admin";

export const ROLES: Role[] = ["member", "lead", "release_manager", "admin"];

export function isKnownRole(role: string | null | undefined): role is Role {
  return role === "member" || role === "lead" || role === "release_manager" || role === "admin";
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
  | "branch.sync"
  | "report.view"
  | "report.export"
  | "report.configure"
  | "board.team";

/**
 * Permission policy: every signed-in user shares one effective role for
 * release, branch, board and report actions. Only the admin-level actions
 * (user management, integrations, report configuration) remain admin-only.
 */
export function can(session: { user?: { role?: string } } | null | undefined, perm: Permission): boolean {
  const r = roleOf(session);
  switch (perm) {
    case "release.view":
    case "release.check":
    case "release.manage":
    case "release.approve":
    case "release.publish":
    case "branch.view":
    case "branch.confirm":
    case "branch.manage":
    case "branch.sync":
    case "report.view":
    case "report.export":
    case "board.team":
      return true; // any signed-in user
    case "admin.users":
    case "admin.integrations":
    case "report.configure":
      return r === "admin";
    default:
      return false;
  }
}
