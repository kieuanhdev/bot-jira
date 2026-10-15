import { cache } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

export const getSession = cache(async () => {
  return getServerSession(authOptions);
});

export type AppSession = Awaited<ReturnType<typeof getSession>>;

export function requireUser() {
  return getSession();
}

export function isAdmin(user?: { user?: { role?: string } } | null): boolean {
  return user?.user?.role === "admin";
}
