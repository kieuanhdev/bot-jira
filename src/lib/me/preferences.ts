import { prisma } from "@/lib/prisma";
import { listActiveProjects, normalizeProjectKey } from "@/lib/jira/project-catalog";

/** The user's saved board project keys plus every project they may pick from. */
export async function getMePreferences(userId: string) {
  const [user, activeCatalog] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { boardProjects: true },
    }),
    listActiveProjects(),
  ]);

  const activeKeys = new Set(activeCatalog.map((p) => p.key));
  const projects = (user?.boardProjects ?? [])
    .map(normalizeProjectKey)
    .filter((k) => activeKeys.has(k));

  return { projects, available: activeCatalog.map((p) => p.key) };
}
