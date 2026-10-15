import { prisma } from "@/lib/prisma";
import { getUserScopedProjects } from "@/lib/project-scope";

export type WatchedItem = {
  jiraKey: string;
  summary: string;
  status: string;
  assigneeJira: string | null;
  points: number | null;
  labels: string[];
  updatedAt: string | null;
  watchedAt: string;
};

/**
 * List the user's watched tasks joined with issue cache data.
 * Parallelizes watch query and user scoped projects resolution.
 */
export async function listWatchedItems(userId: string, role?: string): Promise<WatchedItem[]> {
  const [watches, scope] = await Promise.all([
    prisma.watch.findMany({
      where: { userId },
      orderBy: { watchedAt: "desc" },
    }),
    getUserScopedProjects(userId, role),
  ]);

  if (watches.length === 0) return [];

  const keys = watches.map((w) => w.jiraKey);
  const issues = await prisma.issueCache.findMany({
    where: { jiraKey: { in: keys }, projectKey: { in: scope } },
    select: {
      jiraKey: true,
      summary: true,
      status: true,
      assigneeJira: true,
      points: true,
      labels: true,
      updatedAt: true,
    },
  });

  const byKey = new Map(issues.map((i) => [i.jiraKey, i]));

  return watches
    .map((w) => {
      const issue = byKey.get(w.jiraKey);
      if (!issue) return null;
      return {
        jiraKey: issue.jiraKey,
        summary: issue.summary,
        status: issue.status,
        assigneeJira: issue.assigneeJira,
        points: issue.points,
        labels: issue.labels,
        updatedAt: issue.updatedAt ? issue.updatedAt.toISOString() : null,
        watchedAt: w.watchedAt.toISOString(),
      };
    })
    .filter((x): x is WatchedItem => x !== null);
}
