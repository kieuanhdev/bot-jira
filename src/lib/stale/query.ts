import { prisma } from "@/lib/prisma";
import { listActiveProjects } from "@/lib/jira/project-catalog";
import { jiraUsernameAliases } from "@/lib/user-creds";
import { resolveAllowedProjects, resolveScopedProjects } from "./params";
import { computeStaleInsights } from "./calculator";
import type {
  StaleApiResponse,
  StaleIssueRecord,
  StaleQueryParams,
} from "./types";

/**
 * Fetch active, non-done, non-deleted issues for the given project scope.
 */
export async function fetchStaleIssues(projects: string[]): Promise<StaleIssueRecord[]> {
  const where = {
    deletedAt: null as null,
    projectKey: { in: projects },
    statusCategory: { not: "done" },
  };

  const issues = await prisma.issueCache.findMany({
    where,
    omit: { raw: true, description: true },
    orderBy: { updatedAt: "desc" },
    take: 2000,
  });

  return issues as unknown as StaleIssueRecord[];
}

export interface StaleUserContext {
  id: string;
  jiraUsername?: string | null;
}

/**
 * Execute the stale query for an authenticated user and parsed query parameters.
 */
export async function executeStaleQuery(
  user: StaleUserContext,
  params: StaleQueryParams,
  now?: Date,
): Promise<StaleApiResponse> {
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { boardProjects: true, jiraUsername: true },
  });

  const myUsername = dbUser?.jiraUsername || user.jiraUsername || null;
  const myAliases = jiraUsernameAliases(myUsername);

  const activeCatalog = await listActiveProjects();
  const activeCatalogKeys = new Set(activeCatalog.map((p) => p.key));

  const allowedProjects = resolveAllowedProjects(
    dbUser?.boardProjects ?? [],
    activeCatalog,
  );

  const scopedProjects = resolveScopedProjects(
    params,
    allowedProjects,
    activeCatalogKeys,
  );

  const issues = await fetchStaleIssues(scopedProjects);

  return computeStaleInsights(issues, {
    allowedProjects,
    params,
    myUsername,
    myAliases,
    now,
  });
}
