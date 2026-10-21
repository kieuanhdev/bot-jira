import type { Prisma } from "@prisma/client";
import { env, jiraProjectList, parseSentryMappings } from "@/lib/env";
import type { SentryScope } from "./scope";

/**
 * Constructs a Prisma WHERE condition for filtering Sentry issues by project scope and/or requested project.
 * Returns:
 * - `null`: user is requesting a project outside their scope (access denied -> caller returns empty result)
 * - `undefined`: user has access to all projects (admin with "ALL" or no project filter)
 * - `Prisma.SentryIssueImportedWhereInput`: condition matching targetProject or fallback mapping
 */
export function buildProjectCondition(
  scope: SentryScope,
  projectKey?: string
): Prisma.SentryIssueImportedWhereInput | undefined | null {
  let targetProjects: string[] | null = null;
  const normalizedKey = projectKey?.trim().toUpperCase();

  if (normalizedKey && normalizedKey !== "ALL") {
    if (!scope.all && !scope.projects.includes(normalizedKey)) {
      return null;
    }
    targetProjects = [normalizedKey];
  } else if (!scope.all) {
    targetProjects = scope.projects;
  }

  if (targetProjects === null) {
    return undefined;
  }

  const mappings = parseSentryMappings(env.sentryProjectMappings);
  const fallback = jiraProjectList[0] ?? null;
  const mappedSlugs = mappings
    .filter((m) => targetProjects!.includes(m.jiraProject))
    .map((m) => m.sentryProject);
  const fallbackMatches = Boolean(fallback && targetProjects.includes(fallback));

  const nullTargetCondition: Prisma.SentryIssueImportedWhereInput | null = mappings.length > 0
    ? (mappedSlugs.length > 0 ? { targetProject: null, sentryProject: { in: mappedSlugs } } : null)
    : (fallbackMatches ? { targetProject: null } : null);

  return nullTargetCondition
    ? {
        OR: [
          { targetProject: { in: targetProjects } },
          nullTargetCondition,
        ],
      }
    : { targetProject: { in: targetProjects } };
}
