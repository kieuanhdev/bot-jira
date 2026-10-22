// Pure session helpers. Kept free of server-only imports (next/headers, prisma)
// so client components can use them without bundling server code.

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
