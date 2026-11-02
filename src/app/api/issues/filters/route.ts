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

export function _clearFiltersCache(): void {
  filtersCache.clear();
}

/**
 * Distinct filter options (assignees, labels, priorities) for the current
 * project scope. Avoids loading the full issue list just to derive dropdown
 * options — the previous approach fetched up to 500 issues client-side.
 */
export async function GET(req: Request) {
  const reqStart = Date.now();
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
      assignees: [], statuses: [], labels: [], priorities: [], epics: [], epicTitles: {}, types: [],
      fixVersions: [], reporters: [], approvers: [], testers: [], displayNames: {},
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

  const [assignees, statuses, priorities, types, reporters, approvers, testers, referencedEpics, epicIssues] = await prisma.$transaction([
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
    prisma.issueCache.findMany({ where: { ...base, epicKey: { not: null } }, select: { epicKey: true }, distinct: ["epicKey"] }),
    prisma.issueCache.findMany({
      where: { ...base, type: { equals: "Epic", mode: "insensitive" } },
      select: { jiraKey: true, summary: true, updatedAt: true, createdAt: true },
      orderBy: { updatedAt: "desc" },
    }),
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

  // Combine direct epic issues and epics referenced by tasks
  const epicMap = new Map<string, { summary: string; updatedAt: Date | null }>();

  for (const ep of epicIssues ?? []) {
    if (ep.jiraKey) {
      epicMap.set(ep.jiraKey, {
        summary: ep.summary || "",
        updatedAt: ep.updatedAt || ep.createdAt || null,
      });
    }
  }

  const referencedKeys = (referencedEpics ?? []).flatMap((row) => (row.epicKey ? [row.epicKey] : []));
  const missingKeys = referencedKeys.filter((k) => !epicMap.has(k));

  if (missingKeys.length > 0) {
    const missingEpics = await prisma.issueCache.findMany({
      where: { jiraKey: { in: missingKeys } },
      select: { jiraKey: true, summary: true, updatedAt: true, createdAt: true },
    });
    for (const ep of missingEpics ?? []) {
      epicMap.set(ep.jiraKey, {
        summary: ep.summary || "",
        updatedAt: ep.updatedAt || ep.createdAt || null,
      });
    }
    for (const k of missingKeys) {
      if (!epicMap.has(k)) {
        epicMap.set(k, { summary: "", updatedAt: null });
      }
    }
  }

  const sortedEpics = Array.from(epicMap.keys()).sort((a, b) => {
    const timeA = epicMap.get(a)?.updatedAt?.getTime() ?? 0;
    const timeB = epicMap.get(b)?.updatedAt?.getTime() ?? 0;
    if (timeA !== timeB) return timeB - timeA;

    const matchA = a.match(/^([A-Za-z]+)-(\d+)$/);
    const matchB = b.match(/^([A-Za-z]+)-(\d+)$/);
    if (matchA && matchB && matchA[1] === matchB[1]) {
      return parseInt(matchB[2], 10) - parseInt(matchA[2], 10);
    }
    return b.localeCompare(a);
  });

  const epicTitles: Record<string, string> = {};
  for (const [k, v] of epicMap.entries()) {
    if (v.summary) {
      epicTitles[k] = v.summary;
    }
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
    epics: sortedEpics,
    epicTitles,
    types: types.map((row) => row.type),
    fixVersions: fixVersionRows.map((row) => row.value).filter(Boolean),
    reporters: reporters.flatMap((row) => row.reporterJira ? [row.reporterJira] : []),
    approvers: approvers.flatMap((row) => row.approverJira ? [row.approverJira] : []),
    testers: testers.flatMap((row) => row.testerJira ? [row.testerJira] : []),
    displayNames,
  };
  if (filtersCache.size > 200) filtersCache.clear();
  filtersCache.set(cacheKey, { at: Date.now(), body });
  const dur = Date.now() - reqStart;
  return NextResponse.json(body, {
    headers: { "Server-Timing": `total;dur=${dur}` },
  });
}
