import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isKnownProject, jiraProjectList } from "@/lib/env";

/**
 * Distinct filter options (assignees, labels, priorities) for the current
 * project scope. Avoids loading the full issue list just to derive dropdown
 * options — the previous approach fetched up to 500 issues client-side.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { boardProjects: true },
  });

  const url = new URL(req.url);
  const project = (url.searchParams.get("project") ?? "").trim().toUpperCase();
  const projectList = (url.searchParams.get("projectList") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(isKnownProject);

  let projects: string[];
  if (project && isKnownProject(project)) {
    projects = [project];
  } else if (projectList.length > 0) {
    projects = projectList;
  } else {
    const selected = (user?.boardProjects ?? []).filter(isKnownProject);
    projects = selected.length > 0 ? selected : jiraProjectList;
  }

  if (projects.length === 0) {
    return NextResponse.json({ assignees: [], labels: [], priorities: [] });
  }

  const base = {
    deletedAt: null as null,
    projectKey: { in: projects },
  };

  const [assignees, priorities, labelRows] = await prisma.$transaction([
    prisma.issueCache.findMany({
      where: { ...base, assigneeJira: { not: null } },
      select: { assigneeJira: true },
      distinct: ["assigneeJira"],
      orderBy: { assigneeJira: "asc" },
    }),
    prisma.issueCache.findMany({
      where: { ...base, priority: { not: "" } },
      select: { priority: true },
      distinct: ["priority"],
      orderBy: { priority: "asc" },
    }),
    // labels is a string[] column; Prisma can't groupBy a list field, so we
    // select the raw arrays and flatten client-side. Bounded by the project
    // scope, not a fixed issue cap.
    prisma.issueCache.findMany({
      where: { ...base },
      select: { labels: true },
    }),
  ]);

  const assigneeSet = new Set<string>();
  for (const row of assignees) {
    if (row.assigneeJira) assigneeSet.add(row.assigneeJira);
  }

  const prioritySet = new Set<string>();
  for (const row of priorities) {
    if (row.priority) prioritySet.add(row.priority);
  }

  const labelSet = new Set<string>();
  for (const row of labelRows) {
    for (const l of row.labels ?? []) {
      if (l) labelSet.add(l);
    }
  }

  return NextResponse.json({
    assignees: [...assigneeSet].sort(),
    labels: [...labelSet].sort(),
    priorities: [...prioritySet].sort(),
  });
}
