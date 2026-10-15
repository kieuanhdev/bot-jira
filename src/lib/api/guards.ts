import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import type { Session } from "next-auth";

export type AuthenticatedSession = Session & {
  user: NonNullable<Session["user"]> & { id: string };
};

export type GuardResult<T> =
  | { ok: true; session: T }
  | { ok: false; response: NextResponse };

/**
 * Ensures the caller has an active session with a verified user id.
 * Returns `{ ok: true, session }` or `{ ok: false, response: 401 }`.
 */
export async function requireSession(): Promise<GuardResult<AuthenticatedSession>> {
  const session = await getSession();
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  return {
    ok: true,
    session: session as AuthenticatedSession,
  };
}

/**
 * Ensures the caller has an active session with the admin role.
 * Returns `{ ok: true, session }`, `{ ok: false, response: 401 }` if unauthenticated,
 * or `{ ok: false, response: 403 }` if not an admin.
 */
export async function requireAdmin(): Promise<GuardResult<AuthenticatedSession>> {
  const guard = await requireSession();
  if (!guard.ok) return guard;

  if (guard.session.user.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  return guard;
}
