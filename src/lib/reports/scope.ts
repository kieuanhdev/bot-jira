import { prisma } from "@/lib/prisma";
import { listActiveProjects, normalizeProjectKey } from "@/lib/jira/project-catalog";

export interface ResolvedUserScope {
  userId: string;
  role: string;
  allowedProjects: string[]; // Set of active project keys the user has access to
  hasConfiguredProjects: boolean;
}

/**
 * Resolves the authenticated user's allowed project scope according to
 * system rules (Section 4, RPT-103)
 */
export async function resolveUserProjectScope(
  userId: string,
  userRole: string = "member"
): Promise<ResolvedUserScope> {
  const activeCatalog = await listActiveProjects();
  const activeCatalogKeys = new Set(activeCatalog.map((p) => p.key));

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { boardProjects: true },
  });

  const hasConfiguredProjects = Array.isArray(user?.boardProjects) && user.boardProjects.length > 0;
  const userBoardProjects = (user?.boardProjects ?? [])
    .map(normalizeProjectKey)
    .filter((k) => activeCatalogKeys.has(k));

  let allowedProjects: string[];

  // If user configured board projects, that's their preferred scope.
  // Otherwise, all active catalog projects.
  if (hasConfiguredProjects) {
    allowedProjects = userBoardProjects;
  } else {
    allowedProjects = activeCatalog.map((p) => p.key);
  }

  return {
    userId,
    role: userRole,
    allowedProjects,
    hasConfiguredProjects,
  };
}

/**
 * Validates whether a specific project key is accessible to the user
 */
export async function assertProjectAccess(
  projectKey: string,
  userScope: ResolvedUserScope
): Promise<boolean> {
  const normalized = normalizeProjectKey(projectKey);
  const activeCatalog = await listActiveProjects();
  const exists = activeCatalog.some((p) => p.key === normalized);
  if (!exists) return false;

  // If user has specific board projects configured, check membership
  if (userScope.hasConfiguredProjects) {
    return userScope.allowedProjects.includes(normalized);
  }

  return true;
}

export { resolveScopedProjectKeys } from "./query-primitives";
