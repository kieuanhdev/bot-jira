import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isKnownProject, jiraProjectList } from "@/lib/env";
import { jiraUsernameAliases, userJiraUsername } from "@/lib/user-creds";

/** Project list and open counts from the shared Jira read model. */
export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUsername: true, jiraUserEnc: true, boardProjects: true },
  });
  if (!user) return NextResponse.json({ error: "session_invalid" }, { status: 401 });

  const selected = user.boardProjects.filter(isKnownProject);
  const projects = selected.length > 0 ? selected : jiraProjectList;
  const jiraUsername = userJiraUsername(user);
  const jiraUserAliases = jiraUsernameAliases(jiraUsername);
  const grouped = jiraUsername
    ? await prisma.issueCache.groupBy({
        by: ["projectKey"],
        where: {
          projectKey: { in: projects },
          assigneeJira: { in: jiraUserAliases },
          statusCategory: { not: "done" },
          deletedAt: null,
        },
        _count: { _all: true },
      })
    : [];
  const counts = new Map(grouped.map((row) => [row.projectKey, row._count._all]));
  return NextResponse.json({ items: projects.map((key) => ({ key, openCount: counts.get(key) ?? 0 })) });
}
