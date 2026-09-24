import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { env, isKnownProject, jiraProjectList } from "@/lib/env";
import { jiraUsernameAliases, userJiraUsername } from "@/lib/user-creds";

function positiveLimit(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "300", 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 1000)) : 300;
}

function nonNegativeOffset(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "0", 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUsername: true, jiraUserEnc: true, boardProjects: true },
  });
  if (!user) return NextResponse.json({ error: "session_invalid" }, { status: 401 });

  const url = new URL(req.url);
  const project = (url.searchParams.get("project") ?? "").trim().toUpperCase();
  const requestedProjects = (url.searchParams.get("projectList") ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(isKnownProject);
  const projects = project && isKnownProject(project)
    ? [project]
    : requestedProjects.length > 0
      ? requestedProjects
      : user.boardProjects.length > 0
        ? user.boardProjects.filter(isKnownProject)
        : jiraProjectList;

  const assigneeParam = (url.searchParams.get("assignee") ?? "me").trim();
  const jiraUsername = userJiraUsername(user);
  const includeDone = url.searchParams.get("includeDone") === "1";
  const q = (url.searchParams.get("q") ?? "").trim();
  const label = (url.searchParams.get("label") ?? "").trim();
  const priority = (url.searchParams.get("priority") ?? "").trim();
  const status = (url.searchParams.get("status") ?? "").trim();
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
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (label) where.labels = { has: label };
  if (releaseLabel) where.labels = { has: releaseLabel };
  if (fixVersion) where.fixVersionNames = { has: fixVersion };
  if (assigneeParam.toLowerCase() !== "all") {
    const assignee = assigneeParam.toLowerCase() === "me" ? jiraUsername : assigneeParam;
    const aliases = jiraUsernameAliases(assignee);
    where.assigneeJira = aliases.length > 0 ? { in: aliases } : "__unresolved_current_user__";
  }
  if (q) {
    where.OR = [
      { jiraKey: { contains: q, mode: "insensitive" } },
      { summary: { contains: q, mode: "insensitive" } },
    ];
  }

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

  const successful = cursors.flatMap((cursor) => cursor.lastSuccessAt ? [cursor.lastSuccessAt] : []);
  const oldestSuccess = successful.length > 0
    ? new Date(Math.min(...successful.map((date) => date.getTime())))
    : null;
  const stale = cursors.length < projects.length || !oldestSuccess ||
    Date.now() - oldestSuccess.getTime() > env.jiraFreshnessMinutes * 60_000;

  return NextResponse.json({
    items: items.map((item) => ({
      jiraKey: item.jiraKey,
      projectKey: item.projectKey,
      summary: item.summary,
      description: item.description,
      status: item.status,
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
  });
}
