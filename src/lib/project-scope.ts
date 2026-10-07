import { resolveUserProjectScope } from "@/lib/reports/scope";

/**
 * Project keys the user chose on the Board (their `boardProjects`), limited to
 * active catalog projects. Falls back to every active project when the user has
 * not picked any, so a brand-new account still sees data.
 */
export async function getUserScopedProjects(userId: string, role?: string): Promise<string[]> {
  const scope = await resolveUserProjectScope(userId, role);
  return scope.allowedProjects;
}
