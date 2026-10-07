import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { env } from "@/lib/env";
import {
  listActiveProjects,
  normalizeProjectKey,
} from "@/lib/jira/project-catalog";
import { userJiraUsername } from "@/lib/user-creds";
import { peopleFilterCondition, type PeopleField } from "@/lib/issues/people-filter";
import { startOfTodayForDueDates } from "@/lib/due-date";

function positiveLimit(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "300", 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 1000)) : 300;
}

function nonNegativeOffset(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "0", 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function values(url: URL, name: string): string[] {
  return url.searchParams.getAll(name)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * Single project board read path: pure PostgreSQL query from IssueCache,
 * without any Jira Agile / board membership dependencies.
 */
export async function GET(req: Request) {
  const reqStart = Date.now();
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      jiraUsername: true,
      boardProjects: true,
    },
  });
  if (!user) return NextResponse.json({ error: "session_invalid" }, { status: 401 });

  const userLookupDur = Date.now() - reqStart;

  const activeCatalog = await listActiveProjects();
  const activeCatalogKeys = new Set(activeCatalog.map((p) => p.key));

  const userBoardProjects = user.boardProjects
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
    const requestedProjects = (url.searchParams.get("projectList") ?? "")
      .split(",")
      .map(normalizeProjectKey)
      .filter(isAllowedProject);

    projects = requestedProjects.length > 0
      ? requestedProjects
      : userBoardProjects.length > 0
        ? userBoardProjects
        : activeCatalog.map((p) => p.key);
  }

  const rawAssignees = values(url, "assignee");
  // A role filter ("tôi là Tester"...) already scopes to the current user, so
  // without an explicit assignee it must not also demand assignee = me.
  const hasRoleFilter = values(url, "role").length > 0;
  const assigneeTokens = rawAssignees.length > 0 ? rawAssignees : hasRoleFilter ? ["all"] : ["me"];
  const isAllAssignees =
    assigneeTokens.length === 0 || assigneeTokens.some((a) => a.toLowerCase() === "all");

  const statuses = values(url, "status");
  const labels = values(url, "label");
  const priorities = values(url, "priority");
  const reporters = values(url, "reporter");
  const approvers = values(url, "approver");
  const testers = values(url, "tester");
  const roles = values(url, "role");
  const types = values(url, "type");
  const epics = values(url, "epic");
  const fixVersions = values(url, "fixVersion");

  if (
    assigneeTokens.length > 50 ||
    statuses.length > 50 ||
    labels.length > 50 ||
    priorities.length > 50 || reporters.length > 50 || approvers.length > 50 ||
    testers.length > 50 || roles.length > 4 || types.length > 50 ||
    epics.length > 50 || fixVersions.length > 50
  ) {
    return NextResponse.json(
      { error: "Too many filter values (maximum 50 per facet)." },
      { status: 400 }
    );
  }

  const jiraUsername = userJiraUsername(user);
  const includeDone = url.searchParams.get("includeDone") === "1";
  const q = (url.searchParams.get("q") ?? "").trim();
  const statusCategory = (url.searchParams.get("statusCategory") ?? "").trim().toLowerCase();
  const releaseLabel = (url.searchParams.get("releaseLabel") ?? "").trim();
  const dueBeforeRaw = url.searchParams.get("dueBefore");
  const limit = positiveLimit(url.searchParams.get("limit"));
  const offset = nonNegativeOffset(url.searchParams.get("offset"));

  const where: Prisma.IssueCacheWhereInput = {
    deletedAt: null,
    ...(projects.length > 0 ? { projectKey: { in: projects } } : {}),
  };
  if (!includeDone) where.statusCategory = { not: "done" };
  if (statusCategory) where.statusCategory = statusCategory;

  if (statuses.length === 1) {
    where.status = statuses[0];
  } else if (statuses.length > 1) {
    where.status = { in: statuses };
  }

  if (priorities.length === 1) {
    where.priority = priorities[0];
  } else if (priorities.length > 1) {
    where.priority = { in: priorities };
  }

  if (labels.length === 1) {
    where.labels = { has: labels[0] };
  } else if (labels.length > 1) {
    where.labels = { hasSome: labels };
  }

  if (types.length === 1) where.type = types[0];
  else if (types.length > 1) where.type = { in: types };

  if (epics.length === 1) where.epicKey = epics[0];
  else if (epics.length > 1) where.epicKey = { in: epics };

  const andConditions: Prisma.IssueCacheWhereInput[] = [];
  const addCondition = (condition: Prisma.IssueCacheWhereInput | null) => {
    if (!condition) return;
    if (!("OR" in condition) && !("AND" in condition) && !("NOT" in condition)) {
      Object.assign(where, condition);
    } else {
      andConditions.push(condition);
    }
  };

  if (releaseLabel) {
    if (labels.length > 0) {
      andConditions.push({ labels: { has: releaseLabel } });
    } else {
      where.labels = { has: releaseLabel };
    }
  }

  if (fixVersions.length === 1) where.fixVersionNames = { has: fixVersions[0] };
  else if (fixVersions.length > 1) where.fixVersionNames = { hasSome: fixVersions };

  if (!isAllAssignees) {
    addCondition(peopleFilterCondition("assigneeJira", assigneeTokens, jiraUsername));
  }
  for (const [field, tokens] of [
    ["reporterJira", reporters], ["approverJira", approvers], ["testerJira", testers],
  ] as Array<[PeopleField, string[]]>) {
    const condition = peopleFilterCondition(field, tokens, jiraUsername);
    addCondition(condition);
  }

  if (roles.length > 0) {
    const roleFields: Record<string, PeopleField> = {
      assignee: "assigneeJira", reporter: "reporterJira", approver: "approverJira", tester: "testerJira",
    };
    const roleConditions = roles.flatMap((role) => {
      const field = roleFields[role.toLowerCase()];
      const condition = field ? peopleFilterCondition(field, ["me"], jiraUsername) : null;
      return condition ? [condition] : [];
    });
    if (roleConditions.length > 0) andConditions.push({ OR: roleConditions });
  }

  const now = new Date();
  if (url.searchParams.get("overdue") === "1") {
    andConditions.push({ dueDate: { lt: startOfTodayForDueDates(now) }, statusCategory: { not: "done" } });
  }
  if (dueBeforeRaw) {
    const dueBefore = new Date(dueBeforeRaw);
    if (!Number.isNaN(dueBefore.getTime())) andConditions.push({ dueDate: { lte: dueBefore } });
  }
  if (url.searchParams.get("unestimated") === "1") {
    where.originalEstimateSeconds = null;
    andConditions.push({ statusCategory: { not: "done" } });
  }
  const staleDays = Number.parseInt(url.searchParams.get("staleDays") ?? "", 10);
  if (Number.isFinite(staleDays) && staleDays > 0) {
    where.updatedAt = { lt: new Date(Date.now() - staleDays * 86_400_000) };
    andConditions.push({ statusCategory: { not: "done" } });
  }

  if (q) {
    andConditions.push({
      OR: [
        { jiraKey: { contains: q, mode: "insensitive" } },
        { summary: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  const dbStart = Date.now();
  const [items, total, cursors] = await prisma.$transaction([
    prisma.issueCache.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { jiraKey: "asc" }],
      skip: offset,
      take: limit,
      include: {
        aiScore: { include: { decisions: { orderBy: { decidedAt: "desc" }, take: 1 } } },
        branches: {
          where: { deletedAt: null, linkState: { notIn: ["rejected", "manual_unlinked"] } },
          select: { prState: true, merged: true },
        },
      },
    }),
    prisma.issueCache.count({ where }),
    prisma.integrationCursor.findMany({
      where: { integration: "jira", scope: { in: projects } },
      select: { scope: true, lastSuccessAt: true, lastStartedAt: true, lastError: true },
    }),
  ]);
  const dbDur = Date.now() - dbStart;
  const totalDur = Date.now() - reqStart;

  const successful = cursors.flatMap((cursor) => cursor.lastSuccessAt ? [cursor.lastSuccessAt] : []);
  const oldestSuccess = successful.length > 0
    ? new Date(Math.min(...successful.map((date) => date.getTime())))
    : null;
  const stale = cursors.length < projects.length || !oldestSuccess ||
    Date.now() - oldestSuccess.getTime() > env.jiraFreshnessMinutes * 60_000;

  const responseHeaders = new Headers();
  responseHeaders.set(
    "Server-Timing",
    `user;dur=${userLookupDur}, db;dur=${dbDur}, total;dur=${totalDur}`
  );

  return NextResponse.json(
    {
      items: items.map((item) => ({
        jiraKey: item.jiraKey,
        projectKey: item.projectKey,
        summary: item.summary,
        description: item.description,
        status: item.status,
        statusId: item.statusId,
        statusCategory: item.statusCategory,
        statusChangedAt: item.statusChangedAt,
        assigneeJira: item.assigneeJira,
        reporterJira: item.reporterJira,
        approverJira: item.approverJira,
        testerJira: item.testerJira,
        labels: item.labels,
        fixVersionIds: item.fixVersionIds,
        fixVersionNames: item.fixVersionNames,
        priority: item.priority,
        points: item.points,
        type: item.type,
        dueDate: item.dueDate,
        timeSpent: item.timeSpent,
        originalEstimateSeconds: item.originalEstimateSeconds,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        lastSyncedAt: item.lastSyncedAt,
        aiScore: item.aiScore,
        aiDecision: item.aiScore?.decisions?.[0]
          ? {
              decision: item.aiScore.decisions[0].decision,
              finalPoints: item.aiScore.decisions[0].finalPoints,
              decidedAt: item.aiScore.decisions[0].decidedAt,
            }
          : null,
        delivery: item.branches && item.branches.length > 0
          ? {
              branchCount: item.branches.length,
              prOpen: item.branches.some((b) => (b.prState ?? "").toUpperCase() === "OPEN"),
              prMerged: item.branches.some((b) => (b.prState ?? "").toUpperCase() === "MERGED" || b.merged),
            }
          : null,
        epic: item.epicKey,
      })),
      total,
      sync: {
        projects,
        lastSuccessAt: oldestSuccess,
        stale,
        freshnessMinutes: env.jiraFreshnessMinutes,
        errors: cursors.filter((cursor) => cursor.lastError).map((cursor) => ({ project: cursor.scope, error: cursor.lastError })),
      },
      membership: null,
    },
    { headers: responseHeaders }
  );
}
