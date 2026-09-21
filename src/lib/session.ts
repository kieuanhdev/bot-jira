import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

export async function getSession() {
  return getServerSession(authOptions);
}

export type AppSession = Awaited<ReturnType<typeof getSession>>;

export function requireUser() {
  return getSession();
}

export function isAdmin(user?: { user?: { role?: string } } | null): boolean {
  return user?.user?.role === "admin";
}
