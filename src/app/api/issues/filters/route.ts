import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  listActiveProjects,
  normalizeProjectKey,
} from "@/lib/jira/project-catalog";

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

  const activeCatalog = await listActiveProjects();
  const activeCatalogKeys = new Set(activeCatalog.map((p) => p.key));

  const userBoardProjects = (user?.boardProjects ?? [])
    .map(normalizeProjectKey)
    .filter((k) => activeCatalogKeys.has(k));

  const isAllowedProject = (k: string) =>
    activeCatalogKeys.has(k) || userBoardProjects.includes(k);

  const url = new URL(req.url);
  const rawProject = url.searchParams.get("project");
  let projects: string[];

  if (rawProject !== null && rawProject.trim() !== "") {
    const project = normalizeProjectKey(rawProject);
    if (!activeCatalogKeys.has(project)) {
      return NextResponse.json(
        { error: `Project '${project}' không tồn tại hoặc đã bị vô hiệu hóa.` },
        { status: 404 }
      );
    }
    if (!isAllowedProject(project)) {
      return NextResponse.json(
        { error: `Bạn không có quyền truy cập dự án '${project}'.` },
        { status: 403 }
      );
    }
    projects = [project];
  } else {
    const projectList = (url.searchParams.get("projectList") ?? "")
      .split(",")
      .map(normalizeProjectKey)
      .filter(isAllowedProject);

    projects = projectList.length > 0
      ? projectList
      : userBoardProjects.length > 0
        ? userBoardProjects
        : activeCatalog.map((p) => p.key);
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
