import { prisma } from "@/lib/prisma";
import {
  listActiveProjects,
  normalizeProjectKey,
} from "@/lib/jira/project-catalog";
import {
  userJiraUsername,
  jiraUsernameAliases,
  userJiraAuth,
} from "@/lib/user-creds";
import { getProjectPeopleFields } from "@/lib/jira/people-fields";
import { env } from "@/lib/env";
import { can } from "@/lib/permissions";

export interface BoardBootstrap {
  preferences: {
    projects: string[];
    available: string[];
  };
  projects: {
    items: Array<{
      key: string;
      name: string;
      selected: boolean;
      openCount: number;
      syncEnabled: boolean;
    }>;
  };
  meStatus: {
    jiraLinked: boolean;
    onboarded: boolean;
    jiraName: string | null;
    jiraVerifiedAt: string | null;
    jiraBaseUrl: string;
    bitbucketBaseUrl: string | null;
    role: string;
    canBoardTeam: boolean;
  };
  initialProject: string;
  peopleFieldData?: {
    fields: { reporter: string; approver?: string | null; tester?: string | null };
  } | null;
}

/**
 * Server-side board bootstrap loader.
 * Loads preferences, catalog projects, open issue counts, Jira user status,
 * and initial project people-fields in one scoped server execution,
 * eliminating the client-side waterfall before issues and statuses can load.
 */
export async function getBoardBootstrap(
  userId: string,
  initialProjectFromUrl?: string
): Promise<BoardBootstrap | null> {
  const [user, activeCatalog] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        jiraUserEnc: true,
        jiraTokenEnc: true,
        jiraAuth: true,
        jiraVerifiedAt: true,
        jiraUsername: true,
        onboarded: true,
        role: true,
        boardProjects: true,
      },
    }),
    listActiveProjects(),
  ]);

  if (!user) return null;

  const activeKeys = new Set(activeCatalog.map((p) => p.key));
  const userProjects = (user.boardProjects || [])
    .map(normalizeProjectKey)
    .filter((k) => activeKeys.has(k));

  const availableKeys = activeCatalog.map((p) => p.key);
  const preferredKeys = userProjects.length === 0 ? availableKeys : userProjects;

  const jiraUsername = userJiraUsername(user);
  const jiraUserAliases = jiraUsername ? jiraUsernameAliases(jiraUsername) : [];

  const grouped =
    jiraUsername && activeKeys.size > 0
      ? await prisma.issueCache.groupBy({
          by: ["projectKey"],
          where: {
            projectKey: { in: Array.from(activeKeys) },
            assigneeJira: { in: jiraUserAliases },
            statusCategory: { not: "done" },
            deletedAt: null,
          },
          _count: { _all: true },
        })
      : [];

  const counts = new Map(grouped.map((row) => [row.projectKey, row._count._all]));
  const projectItems = activeCatalog.map((project) => ({
    key: project.key,
    name: project.name || project.key,
    selected: userProjects.includes(project.key),
    openCount: counts.get(project.key) ?? 0,
    syncEnabled: project.syncEnabled,
  }));

  const auth = userJiraAuth(user);
  const meStatus = {
    jiraLinked: Boolean(auth),
    onboarded: Boolean(user.onboarded),
    jiraName: jiraUsername,
    jiraVerifiedAt: user.jiraVerifiedAt?.toISOString() ?? null,
    jiraBaseUrl: env.jiraBaseUrl,
    bitbucketBaseUrl: env.bitbucketBaseUrl || null,
    role: user.role,
    canBoardTeam: can({ user: { role: user.role } }, "board.team"),
  };

  const normalizedUrlProject = initialProjectFromUrl
    ? normalizeProjectKey(initialProjectFromUrl)
    : "";

  const initialProject =
    normalizedUrlProject && activeKeys.has(normalizedUrlProject)
      ? normalizedUrlProject
      : preferredKeys[0] ?? "";

  let peopleFieldData: {
    fields: { reporter: string; approver?: string | null; tester?: string | null };
  } | null = null;

  if (initialProject) {
    try {
      const fields = await getProjectPeopleFields(initialProject);
      peopleFieldData = { fields };
    } catch {
      peopleFieldData = null;
    }
  }

  return {
    preferences: {
      projects: userProjects,
      available: availableKeys,
    },
    projects: {
      items: projectItems,
    },
    meStatus,
    initialProject,
    peopleFieldData,
  };
}
