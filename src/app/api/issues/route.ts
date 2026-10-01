import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { env } from "@/lib/env";
import {
  listActiveProjects,
  normalizeProjectKey,
} from "@/lib/jira/project-catalog";
import { jiraUsernameAliases, userJiraUsername } from "@/lib/user-creds";

function positiveLimit(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "300", 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 1000)) : 300;
}

function nonNegativeOffset(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "0", 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
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

  const rawAssignees = url.searchParams.getAll("assignee");
  const assigneeTokens = (rawAssignees.length > 0 ? rawAssignees : ["me"])
    .flatMap((s) => s.split(","))
    .map((s) => s.trim())
    .filter(Boolean);
  const isAllAssignees =
    assigneeTokens.length === 0 || assigneeTokens.some((a) => a.toLowerCase() === "all");

  const rawStatuses = url.searchParams.getAll("status");
  const statuses = rawStatuses
    .flatMap((s) => s.split(","))
    .map((s) => s.trim())
    .filter(Boolean);

  const rawLabels = url.searchParams.getAll("label");
  const labels = rawLabels
    .flatMap((s) => s.split(","))
    .map((s) => s.trim())
    .filter(Boolean);

  const rawPriorities = url.searchParams.getAll("priority");
  const priorities = rawPriorities
    .flatMap((s) => s.split(","))
    .map((s) => s.trim())
    .filter(Boolean);

  if (
    assigneeTokens.length > 50 ||
    statuses.length > 50 ||
    labels.length > 50 ||
    priorities.length > 50
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
  const fixVersion = (url.searchParams.get("fixVersion") ?? "").trim();
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

  const andConditions: Prisma.IssueCacheWhereInput[] = [];

  if (releaseLabel) {
    if (labels.length > 0) {
      andConditions.push({ labels: { has: releaseLabel } });
    } else {
      where.labels = { has: releaseLabel };
    }
  }

  if (fixVersion) where.fixVersionNames = { has: fixVersion };

  // Assignee filtering
  if (!isAllAssignees) {
    const hasUnassigned = assigneeTokens.some(
      (a) => a.toLowerCase() === "unassigned" || a.toLowerCase() === "none"
    );
    const namedTokens = assigneeTokens.filter(
      (a) => a.toLowerCase() !== "unassigned" && a.toLowerCase() !== "none"
    );

    const aliases = Array.from(
      new Set(
        namedTokens.flatMap((a) => {
          const name = a.toLowerCase() === "me" ? jiraUsername : a;
          return jiraUsernameAliases(name);
        })
      )
    );

    if (hasUnassigned && aliases.length > 0) {
      andConditions.push({
        OR: [{ assigneeJira: { in: aliases } }, { assigneeJira: null }],
      });
    } else if (hasUnassigned) {
      where.assigneeJira = null;
    } else {
      where.assigneeJira = aliases.length > 0 ? { in: aliases } : "__unresolved_current_user__";
    }
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
        labels: item.labels,
        fixVersionIds: item.fixVersionIds,
        fixVersionNames: item.fixVersionNames,
        priority: item.priority,
        points: item.points,
        type: item.type,
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
