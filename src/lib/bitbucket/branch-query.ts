import { prisma } from "@/lib/prisma";
import { evaluateBranchAttention, type AttentionSignal } from "./branch-risk";
import type { Prisma } from "@prisma/client";

export type BranchQueryParams = {
  q?: string;
  project?: string;
  repo?: string;
  link?: "ALL" | "linked" | "suggested" | "unlinked";
  pr?: "ALL" | "none" | "open" | "merged" | "declined" | "closed";
  taskStatus?: string;
  assignee?: string;
  attention?: "0" | "1";
  sort?: "attention" | "updated" | "branch" | "repo" | "task";
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type CountOption = {
  value: string;
  label: string;
  count: number;
};

export type BranchTaskSummary = {
  jiraKey: string;
  summary: string;
  status: string;
  statusCategory: string;
  assigneeJira: string | null;
  priority: string;
  points: number | null;
  dueDate: string | null;
};

export type BranchRowItem = {
  id: string;
  repo: string;
  branch: string;
  jiraKey: string | null;
  suggestedJiraKey: string | null;
  latestCommitSha: string | null;
  lastCommitAt: string | null;
  prId: number | null;
  prTitle: string | null;
  prUrl: string | null;
  prState: string | null;
  prDestinationBranch: string | null;
  prUpdatedAt: string | null;
  merged: boolean;
  linkSource: string | null;
  linkConfidence: number | null;
  linkState?: string;
  checkedAt: string;
  task: BranchTaskSummary | null;
  attentionSignals: AttentionSignal[];
};

export type BranchesQueryResult = {
  items: BranchRowItem[];
  page: {
    index: number;
    size: number;
    totalItems: number;
    totalPages: number;
  };
  summary: {
    active: number;
    linked: number;
    suggested: number;
    unlinked: number;
    openPr: number;
    attention: number;
  };
  facets: {
    projects: CountOption[];
    repositories: CountOption[];
    prStates: CountOption[];
    taskStatuses: CountOption[];
    assignees: CountOption[];
  };
  freshness: {
    lastSuccessAt: string | null;
    stale: boolean;
    lastError: string | null;
  };
};

export async function queryBranches(params: BranchQueryParams): Promise<BranchesQueryResult> {
  const pageIndex = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, params.pageSize ?? 25));
  const sortField = params.sort ?? "updated";
  const sortOrder = params.order === "asc" ? "asc" : "desc";

  // Check freshness from IntegrationCursor
  const cursor = await prisma.integrationCursor.findUnique({
    where: { integration_scope: { integration: "bitbucket", scope: "branches" } },
  });

  const lastSuccess = cursor?.lastSuccessAt ?? null;
  const isStale = !lastSuccess || Date.now() - new Date(lastSuccess).getTime() > 24 * 60 * 60 * 1000;
  const freshness = {
    lastSuccessAt: lastSuccess ? lastSuccess.toISOString() : null,
    stale: isStale,
    lastError: cursor?.lastError ?? null,
  };

  // BR-001: Build discrete conditions joined strictly with AND
  const andConditions: Prisma.BranchInfoWhereInput[] = [
    { deletedAt: null },
  ];

  // 1. Search text `q`
  if (params.q && params.q.trim()) {
    const q = params.q.trim();
    andConditions.push({
      OR: [
        { branch: { contains: q, mode: "insensitive" } },
        { repo: { contains: q, mode: "insensitive" } },
        { jiraKey: { contains: q, mode: "insensitive" } },
        { suggestedJiraKey: { contains: q, mode: "insensitive" } },
        { prTitle: { contains: q, mode: "insensitive" } },
        { issue: { summary: { contains: q, mode: "insensitive" } } },
      ],
    });
  }

  // 2. Repo filter
  if (params.repo && params.repo !== "ALL") {
    andConditions.push({ repo: params.repo });
  }

  // 3. Project filter (matches repo prefix e.g. "team/" or issue.projectKey)
  if (params.project && params.project !== "ALL") {
    andConditions.push({
      OR: [
        { repo: { startsWith: `${params.project}/` } },
        { issue: { projectKey: params.project } },
      ],
    });
  }

  // 4. Link state filter
  if (params.link && params.link !== "ALL") {
    if (params.link === "linked") {
      andConditions.push({
        jiraKey: { not: null },
        linkState: { notIn: ["rejected", "manual_unlinked"] },
      });
    } else if (params.link === "suggested") {
      andConditions.push({
        jiraKey: null,
        suggestedJiraKey: { not: null },
        linkState: { notIn: ["rejected", "manual_unlinked"] },
      });
    } else if (params.link === "unlinked") {
      andConditions.push({
        jiraKey: null,
        suggestedJiraKey: null,
      });
    }
  }

  // 5. PR state filter
  if (params.pr && params.pr !== "ALL") {
    if (params.pr === "none") {
      andConditions.push({ prState: null });
    } else if (params.pr === "open") {
      andConditions.push({ prState: { in: ["OPEN", "open"] } });
    } else if (params.pr === "merged") {
      andConditions.push({
        OR: [
          { prState: { in: ["MERGED", "merged"] } },
          { merged: true },
        ],
      });
    } else if (params.pr === "declined") {
      andConditions.push({ prState: { in: ["DECLINED", "declined"] } });
    } else if (params.pr === "closed") {
      andConditions.push({ prState: { in: ["CLOSED", "closed"] } });
    }
  }

  // 6. Task status & assignee filter
  const issueWhere: Prisma.IssueCacheWhereInput = {};
  if (params.taskStatus && params.taskStatus !== "ALL") {
    issueWhere.status = params.taskStatus;
  }
  if (params.assignee && params.assignee !== "ALL") {
    if (params.assignee === "unassigned") {
      issueWhere.assigneeJira = null;
    } else {
      issueWhere.assigneeJira = params.assignee;
    }
  }
  if (Object.keys(issueWhere).length > 0) {
    andConditions.push({ issue: { is: issueWhere } });
  }

  // 7. Attention filter condition (matching business anomaly rules)
  const businessAttentionCondition: Prisma.BranchInfoWhereInput = {
    OR: [
      // Task Done but PR open
      { prState: { in: ["OPEN", "open"] }, issue: { statusCategory: "done" } },
      // PR merged but task not done
      { merged: true, issue: { statusCategory: { not: "done" } } },
      { prState: { in: ["MERGED", "merged"] }, issue: { statusCategory: { not: "done" } } },
      // Active task without PR
      { jiraKey: { not: null }, prState: null, issue: { statusCategory: "indeterminate" } },
      // Suggested link awaits review
      { jiraKey: null, suggestedJiraKey: { not: null }, linkState: { notIn: ["rejected", "manual_unlinked"] } },
    ],
  };

  if (params.attention === "1") {
    andConditions.push(businessAttentionCondition);
  }

  const where: Prisma.BranchInfoWhereInput = { AND: andConditions };

  // Fast Global Summary Counts (independent of current filters)
  const [totalActive, totalLinked, totalSuggested, totalUnlinked, totalOpenPr, totalAttention] =
    await Promise.all([
      prisma.branchInfo.count({ where: { deletedAt: null } }),
      prisma.branchInfo.count({
        where: { deletedAt: null, jiraKey: { not: null }, linkState: { notIn: ["rejected", "manual_unlinked"] } },
      }),
      prisma.branchInfo.count({
        where: { deletedAt: null, jiraKey: null, suggestedJiraKey: { not: null }, linkState: { notIn: ["rejected", "manual_unlinked"] } },
      }),
      prisma.branchInfo.count({
        where: { deletedAt: null, jiraKey: null, suggestedJiraKey: null },
      }),
      prisma.branchInfo.count({
        where: { deletedAt: null, prState: { in: ["OPEN", "open"] } },
      }),
      prisma.branchInfo.count({
        where: {
          deletedAt: null,
          ...businessAttentionCondition,
        },
      }),
    ]);

  // Database-level sorting & pagination
  const orderBy: Prisma.BranchInfoOrderByWithRelationInput[] = [];
  if (sortField === "branch") {
    orderBy.push({ branch: sortOrder });
  } else if (sortField === "repo") {
    orderBy.push({ repo: sortOrder });
  } else if (sortField === "task") {
    orderBy.push({ jiraKey: sortOrder });
  } else {
    // updated / checked
    orderBy.push({ prUpdatedAt: { sort: sortOrder, nulls: "last" } });
    orderBy.push({ checkedAt: sortOrder });
  }

  const [rows, totalItems] = await Promise.all([
    prisma.branchInfo.findMany({
      where,
      orderBy,
      skip: (pageIndex - 1) * pageSize,
      take: pageSize,
      include: {
        issue: {
          select: {
            jiraKey: true,
            summary: true,
            status: true,
            statusCategory: true,
            assigneeJira: true,
            priority: true,
            points: true,
            dueDate: true,
          },
        },
      },
    }),
    prisma.branchInfo.count({ where }),
  ]);

  const items: BranchRowItem[] = rows.map((c) => {
    const signals = evaluateBranchAttention({
      jiraKey: c.jiraKey,
      suggestedJiraKey: c.suggestedJiraKey,
      taskStatus: c.issue?.status,
      taskStatusCategory: c.issue?.statusCategory,
      prState: c.prState,
      merged: c.merged,
      checkedAt: c.checkedAt,
      syncStale: freshness.stale,
      syncError: freshness.lastError,
    });

    return {
      id: c.id,
      repo: c.repo,
      branch: c.branch,
      jiraKey: c.jiraKey,
      suggestedJiraKey: c.suggestedJiraKey,
      latestCommitSha: c.latestCommitSha,
      lastCommitAt: c.lastCommitAt ? c.lastCommitAt.toISOString() : null,
      prId: c.prId,
      prTitle: c.prTitle,
      prUrl: c.prUrl,
      prState: c.prState,
      prDestinationBranch: c.prDestinationBranch,
      prUpdatedAt: c.prUpdatedAt ? c.prUpdatedAt.toISOString() : null,
      merged: c.merged,
      linkSource: c.linkSource,
      linkConfidence: c.linkConfidence,
      linkState: c.linkState,
      checkedAt: c.checkedAt.toISOString(),
      task: c.issue
        ? {
            jiraKey: c.issue.jiraKey,
            summary: c.issue.summary,
            status: c.issue.status,
            statusCategory: c.issue.statusCategory,
            assigneeJira: c.issue.assigneeJira,
            priority: c.issue.priority,
            points: c.issue.points,
            dueDate: c.issue.dueDate ? c.issue.dueDate.toISOString() : null,
          }
        : null,
      attentionSignals: signals,
    };
  });

  // Calculate facets from distinct active values (BR-010: do not silently cap top 20 repos)
  const [repoGroups, prGroups, statusGroups, assigneeGroups] = await Promise.all([
    prisma.branchInfo.groupBy({
      by: ["repo"],
      where: { deletedAt: null },
      _count: { _all: true },
      orderBy: { _count: { repo: "desc" } },
    }),
    prisma.branchInfo.groupBy({
      by: ["prState"],
      where: { deletedAt: null, prState: { not: null } },
      _count: { _all: true },
    }),
    prisma.issueCache.groupBy({
      by: ["status"],
      where: {
        deletedAt: null,
        branches: { some: { deletedAt: null } },
      },
      _count: { _all: true },
      orderBy: { _count: { status: "desc" } },
    }),
    prisma.issueCache.groupBy({
      by: ["assigneeJira"],
      where: {
        deletedAt: null,
        assigneeJira: { not: null },
        branches: { some: { deletedAt: null } },
      },
      _count: { _all: true },
      orderBy: { _count: { assigneeJira: "desc" } },
    }),
  ]);

  const projectsMap = new Map<string, number>();
  for (const r of repoGroups) {
    const proj = r.repo.split("/")[0] ?? r.repo;
    projectsMap.set(proj, (projectsMap.get(proj) ?? 0) + r._count._all);
  }

  const facets = {
    projects: Array.from(projectsMap.entries()).map(([value, count]) => ({
      value,
      label: value,
      count,
    })),
    repositories: repoGroups.map((r) => ({
      value: r.repo,
      label: r.repo,
      count: r._count._all,
    })),
    prStates: prGroups.map((p) => ({
      value: p.prState ?? "none",
      label: p.prState ?? "No PR",
      count: p._count._all,
    })),
    taskStatuses: statusGroups.map((s) => ({
      value: s.status,
      label: s.status,
      count: s._count._all,
    })),
    assignees: assigneeGroups
      .filter((a): a is { assigneeJira: string; _count: { _all: number } } => Boolean(a.assigneeJira))
      .map((a) => ({
        value: a.assigneeJira,
        label: a.assigneeJira,
        count: a._count._all,
      })),
  };

  return {
    items,
    page: {
      index: pageIndex,
      size: pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    },
    summary: {
      active: totalActive,
      linked: totalLinked,
      suggested: totalSuggested,
      unlinked: totalUnlinked,
      openPr: totalOpenPr,
      attention: totalAttention,
    },
    facets,
    freshness,
  };
}
