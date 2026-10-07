import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { jiraUsernameAliases } from "@/lib/user-creds";
import { getSession } from "@/lib/session";
import {
  listActiveProjects,
  normalizeProjectKey,
} from "@/lib/jira/project-catalog";

// Filter options change only on sync, so a short per-scope cache absorbs the
// 9 queries every page view would otherwise issue.
const FILTERS_TTL_MS = 30_000;
const filtersCache = new Map<string, { at: number; body: unknown }>();

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
    return NextResponse.json({
      assignees: [], statuses: [], labels: [], priorities: [], epics: [], types: [],
      fixVersions: [], reporters: [], approvers: [], testers: [],
    });
  }

  const cacheKey = [...projects].sort().join(",");
  const cached = filtersCache.get(cacheKey);
  if (cached && Date.now() - cached.at < FILTERS_TTL_MS) {
    return NextResponse.json(cached.body);
  }

  const base = {
    deletedAt: null as null,
    projectKey: { in: projects },
  };

  const [assignees, statuses, priorities, types, reporters, approvers, testers, epics] = await prisma.$transaction([
    prisma.issueCache.findMany({
      where: { ...base, assigneeJira: { not: null } },
      select: { assigneeJira: true },
      distinct: ["assigneeJira"],
      orderBy: { assigneeJira: "asc" },
    }),
    prisma.issueCache.findMany({
      where: { ...base, status: { not: "" } },
      select: { status: true },
      distinct: ["status"],
      orderBy: { status: "asc" },
    }),
    prisma.issueCache.findMany({
      where: { ...base, priority: { not: "" } },
      select: { priority: true },
      distinct: ["priority"],
      orderBy: { priority: "asc" },
    }),
    prisma.issueCache.findMany({
      where: { ...base, type: { not: "" } }, select: { type: true }, distinct: ["type"], orderBy: { type: "asc" },
    }),
    prisma.issueCache.findMany({ where: { ...base, reporterJira: { not: null } }, select: { reporterJira: true }, distinct: ["reporterJira"], orderBy: { reporterJira: "asc" } }),
    prisma.issueCache.findMany({ where: { ...base, approverJira: { not: null } }, select: { approverJira: true }, distinct: ["approverJira"], orderBy: { approverJira: "asc" } }),
    prisma.issueCache.findMany({ where: { ...base, testerJira: { not: null } }, select: { testerJira: true }, distinct: ["testerJira"], orderBy: { testerJira: "asc" } }),
    prisma.issueCache.findMany({ where: { ...base, epicKey: { not: null } }, select: { epicKey: true }, distinct: ["epicKey"], orderBy: { epicKey: "asc" } }),
  ]);

  const assigneeSet = new Set<string>();
  for (const row of assignees) {
    if (row.assigneeJira) assigneeSet.add(row.assigneeJira);
  }

  const statusSet = new Set<string>();
  for (const row of statuses) {
    if (row.status) statusSet.add(row.status);
  }

  const prioritySet = new Set<string>();
  for (const row of priorities) {
    if (row.priority) prioritySet.add(row.priority);
  }

  const projectSql = Prisma.join(projects.map((project) => Prisma.sql`${project}`));
  const [labelRows, fixVersionRows, users] = await Promise.all([
    prisma.$queryRaw<Array<{ value: string }>>(Prisma.sql`
      SELECT DISTINCT unnest("labels") AS value FROM "IssueCache"
      WHERE "deletedAt" IS NULL AND "projectKey" IN (${projectSql}) ORDER BY value
    `),
    prisma.$queryRaw<Array<{ value: string }>>(Prisma.sql`
      SELECT DISTINCT unnest("fixVersionNames") AS value FROM "IssueCache"
      WHERE "deletedAt" IS NULL AND "projectKey" IN (${projectSql}) ORDER BY value
    `),
    prisma.user.findMany({ where: { jiraUsername: { not: null } }, select: { jiraUsername: true, displayName: true } }),
  ]);
  // Only expose names of people who actually appear in this project scope.
  const present = new Set([
    ...assigneeSet,
    ...reporters.flatMap((row) => row.reporterJira ? [row.reporterJira] : []),
    ...approvers.flatMap((row) => row.approverJira ? [row.approverJira] : []),
    ...testers.flatMap((row) => row.testerJira ? [row.testerJira] : []),
  ].map((name) => name.toLowerCase()));
  const displayNames = Object.fromEntries(users.flatMap((user) =>
    jiraUsernameAliases(user.jiraUsername)
      .filter((alias) => present.has(alias.toLowerCase()))
      .map((alias) => [alias, user.displayName])
  ));

  const body = {
    assignees: [...assigneeSet].sort(),
    statuses: [...statusSet].sort(),
    labels: labelRows.map((row) => row.value).filter(Boolean),
    priorities: [...prioritySet].sort(),
    epics: epics.flatMap((row) => row.epicKey ? [row.epicKey] : []),
    types: types.map((row) => row.type),
    fixVersions: fixVersionRows.map((row) => row.value).filter(Boolean),
    reporters: reporters.flatMap((row) => row.reporterJira ? [row.reporterJira] : []),
    approvers: approvers.flatMap((row) => row.approverJira ? [row.approverJira] : []),
    testers: testers.flatMap((row) => row.testerJira ? [row.testerJira] : []),
    displayNames,
  };
  if (filtersCache.size > 200) filtersCache.clear();
  filtersCache.set(cacheKey, { at: Date.now(), body });
  return NextResponse.json(body);
}
