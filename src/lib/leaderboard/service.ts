import { prisma } from "@/lib/prisma";
import { listActiveProjects } from "@/lib/jira/project-catalog";
import { jiraUsernameAliases, userJiraUsername } from "@/lib/user-creds";
import type { GetLeaderboardOptions, LeaderboardResponse } from "./contracts";
import { computePeriodBounds } from "./period";
import { calculateLeaderboard } from "./calculator";

export type { GetLeaderboardOptions };

const EXCLUDED_MOBILE_PROJECTS = new Set(["EPB"]);

export async function getLeaderboardData(
  options: GetLeaderboardOptions
): Promise<LeaderboardResponse> {
  const { currentUserId, timeframe = "month", year, month, quarter, project } = options;

  // 1. Resolve user identity and the shared mobile-team project scope
  const currentUser = await prisma.user.findUnique({
    where: { id: currentUserId },
    select: { id: true, jiraUsername: true, jiraUserEnc: true },
  });

  const myUsername = currentUser ? userJiraUsername(currentUser) : null;
  const myAliases = jiraUsernameAliases(myUsername).map((a) => a.toLowerCase());

  // The leaderboard represents the whole mobile team, so it must not inherit
  // each user's personal Board project preferences. EPB is not a mobile project.
  const activeProjects = (await listActiveProjects())
    .map(({ key }) => key.trim().toUpperCase())
    .filter((key) => !EXCLUDED_MOBILE_PROJECTS.has(key));
  const cleanProject = project ? project.trim().toUpperCase() : null;
  const projectsInScope =
    cleanProject && activeProjects.includes(cleanProject) ? [cleanProject] : activeProjects;

  // 2. Compute date range
  const period = computePeriodBounds(timeframe, year, month, quarter);

  // 3. Query only users from DB who have logged in with a Jira token
  const dbUsersRaw = await prisma.user.findMany({
    where: {
      jiraTokenEnc: { not: null },
    },
    select: {
      id: true,
      displayName: true,
      jiraUsername: true,
      jiraUserEnc: true,
      jiraTokenEnc: true,
      email: true,
      role: true,
    },
  });

  const dbUsers = dbUsersRaw
    .filter((u) => Boolean(u.jiraTokenEnc && u.jiraTokenEnc.trim().length > 0))
    .map((u) => ({
      id: u.id,
      displayName: u.displayName,
      jiraUsername:
        userJiraUsername(u) ?? u.jiraUsername ?? (u.email ? u.email.split("@")[0] : null),
      email: u.email,
      role: u.role,
    }));

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
      completedAt: true,
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
