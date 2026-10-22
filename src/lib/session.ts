import { cache } from "react";
import { getServerSession, type Session } from "next-auth";
import { cookies } from "next/headers";
import { authOptions } from "./auth";
import { prisma } from "./prisma";

export const IMPERSONATE_COOKIE_NAME = "botjira_impersonate";

export type AppSession = Session | null;

export const getSession = cache(async (): Promise<AppSession> => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return session;
  }

  // Only users who are real admins in their underlying session can impersonate
  if (session.user.role !== "admin") {
    return session;
  }

  try {
    const cookieStore = await cookies();
    const targetUserId = cookieStore.get(IMPERSONATE_COOKIE_NAME)?.value;
    if (!targetUserId || targetUserId === session.user.id) {
      return session;
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        displayName: true,
        email: true,
        role: true,
        jiraUsername: true,
      },
    });

    if (!targetUser) {
      return session;
    }

    const realUser = session.user;
    return {
      ...session,
      user: {
        id: targetUser.id,
        name: targetUser.displayName,
        email: targetUser.email,
        image: null,
        role: targetUser.role,
        jiraUsername: targetUser.jiraUsername,
      },
      impersonator: {
        id: realUser.id,
        name: realUser.name ?? null,
        email: realUser.email ?? null,
        role: realUser.role,
        jiraUsername: realUser.jiraUsername,
      },
    };
  } catch {
    // If cookies() is called outside request scope (e.g. background job, build, or tests without context)
    return session;
  }
});

export function isAdmin(session?: { user?: { role?: string } } | null): boolean {
  return session?.user?.role === "admin";
}

export function isRealAdmin(session?: { user?: { role?: string }; impersonator?: { role?: string } } | null): boolean {
  return session?.impersonator?.role === "admin" || session?.user?.role === "admin";
}

export function isImpersonating(session?: unknown): boolean {
  return Boolean(
    session &&
      typeof session === "object" &&
      "impersonator" in session &&
      (session as { impersonator?: unknown }).impersonator
  );
}
