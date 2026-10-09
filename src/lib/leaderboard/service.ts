import { prisma } from "@/lib/prisma";
import { resolveUserProjectScope } from "@/lib/reports/scope";
import { jiraUsernameAliases, userJiraUsername } from "@/lib/user-creds";
import type { GetLeaderboardOptions, LeaderboardResponse } from "./contracts";
import { computePeriodBounds } from "./period";
import { calculateLeaderboard } from "./calculator";

export type { GetLeaderboardOptions };

export async function getLeaderboardData(
  options: GetLeaderboardOptions
): Promise<LeaderboardResponse> {
  const { currentUserId, timeframe = "month", year, month, quarter, project } = options;

  // 1. Resolve user & mobile project scope
  const currentUser = await prisma.user.findUnique({
    where: { id: currentUserId },
    select: { id: true, jiraUsername: true, jiraUserEnc: true },
  });

  const myUsername = currentUser ? userJiraUsername(currentUser) : null;
  const myAliases = jiraUsernameAliases(myUsername).map((a) => a.toLowerCase());

  // Restricted to the projects the user picked on the Board (all active ones if none picked)
  const activeProjects = (await resolveUserProjectScope(currentUserId)).allowedProjects;
  const cleanProject = project ? project.trim().toUpperCase() : null;
  const projectsInScope =
    cleanProject && activeProjects.includes(cleanProject) ? [cleanProject] : activeProjects;

  // 2. Compute date range
  const period = computePeriodBounds(timeframe, year, month, quarter);

  // 3. Query all users from DB to enrich profile information
  const dbUsers = await prisma.user.findMany({
    select: {
      id: true,
      displayName: true,
      jiraUsername: true,
      email: true,
      role: true,
    },
  });

  // 4. Query all issues in scope with points
  const issues = await prisma.issueCache.findMany({
    where: {
      deletedAt: null,
      projectKey: { in: projectsInScope },
      points: { not: null },
    },
    select: {
      jiraKey: true,
      summary: true,
      status: true,
      statusCategory: true,
      statusChangedAt: true,
      updatedAt: true,
      createdAt: true,
      assigneeJira: true,
      points: true,
      priority: true,
      projectKey: true,
      raw: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 5000,
  });

  // 5. Delegate calculation to pure calculator
  return calculateLeaderboard({
    period,
    issues,
    dbUsers,
    myAliases,
    activeProjects,
    selectedProject: cleanProject,
  });
}
