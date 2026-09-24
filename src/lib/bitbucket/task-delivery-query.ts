import { prisma } from "@/lib/prisma";
import { evaluateBranchAttention, type AttentionSignal } from "./branch-risk";
import type { Prisma } from "@prisma/client";

export type DeliveryBranchSummary = {
  id: string;
  repo: string;
  branch: string;
  latestCommitSha: string | null;
  lastCommitAt: string | null;
  prId: number | null;
  prTitle: string | null;
  prUrl: string | null;
  prState: string | null;
  prDestinationBranch: string | null;
  merged: boolean;
};

export type DeliveryTaskRow = {
  jiraKey: string;
  summary: string;
  status: string;
  statusCategory: string;
  assigneeJira: string | null;
  priority: string;
  points: number | null;
  dueDate: string | null;
  branches: DeliveryBranchSummary[];
  branchCount: number;
  repositories: string[];
  prSummary: {
    open: number;
    merged: number;
    declined: number;
    closed: number;
    none: number;
  };
  attention: AttentionSignal[];
  nextActions: string[];
};

export type ReviewSuggestionItem = {
  id: string;
  repo: string;
  branch: string;
  suggestedJiraKey: string;
  prTitle: string | null;
  prUrl: string | null;
  linkSource: string | null;
  linkConfidence: number | null;
  checkedAt: string;
  task: {
    jiraKey: string;
    summary: string;
    status: string;
    statusCategory: string;
    assigneeJira: string | null;
  } | null;
};

export type UnlinkedBranchItem = {
  id: string;
  repo: string;
  branch: string;
  latestCommitSha: string | null;
  lastCommitAt: string | null;
  prId: number | null;
  prTitle: string | null;
  prUrl: string | null;
  prState: string | null;
  checkedAt: string;
};

export type TaskDeliveryQueryParams = {
  view?: "my-work" | "needs-attention" | "pending-review" | "unlinked";
  q?: string;
  project?: string;
  repo?: string;
  pr?: string;
  taskStatus?: string;
  assignee?: string;
  userAliases?: string[];
  page?: number;
  pageSize?: number;
};

export type TaskDeliveryQueryResult = {
  tasks: DeliveryTaskRow[];
  reviewItems?: ReviewSuggestionItem[];
  unlinkedItems?: UnlinkedBranchItem[];
  page: {
    index: number;
    size: number;
    totalItems: number;
    totalPages: number;
  };
  counts: {
    myWork: number;
    needsAttention: number;
    pendingReview: number;
    unlinked: number;
    allBranches: number;
  };
};

export async function queryDeliveryTasks(
  params: TaskDeliveryQueryParams
): Promise<TaskDeliveryQueryResult> {
  const view = params.view ?? "my-work";
  const pageIndex = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, params.pageSize ?? 20));

  // Compute workspace counts for tab headers
  const userAliasFilter: Prisma.IssueCacheWhereInput = params.userAliases && params.userAliases.length > 0
    ? { assigneeJira: { in: params.userAliases } }
    : {};

  const [countMyWork, countPendingReview, countUnlinked, countAllBranches] = await Promise.all([
    // My work: issues assigned to user that have active linked branches
    prisma.issueCache.count({
      where: {
        deletedAt: null,
        ...userAliasFilter,
        branches: {
          some: {
            deletedAt: null,
            linkState: { notIn: ["rejected", "manual_unlinked"] },
          },
        },
      },
    }),
    // Pending review: branches with suggestions awaiting confirmation
    prisma.branchInfo.count({
      where: {
        deletedAt: null,
        jiraKey: null,
        suggestedJiraKey: { not: null },
        linkState: { notIn: ["rejected", "manual_unlinked"] },
      },
    }),
    // Unlinked: active work branches with neither jiraKey nor suggestion
    prisma.branchInfo.count({
      where: {
        deletedAt: null,
        jiraKey: null,
        suggestedJiraKey: null,
        linkState: { notIn: ["rejected", "manual_unlinked"] },
      },
    }),
    // All branches total active
    prisma.branchInfo.count({ where: { deletedAt: null } }),
  ]);

  // If view is pending-review: return ReviewSuggestionItem list
  if (view === "pending-review") {
    const whereBranch: Prisma.BranchInfoWhereInput = {
      deletedAt: null,
      jiraKey: null,
      suggestedJiraKey: { not: null },
      linkState: { notIn: ["rejected", "manual_unlinked"] },
    };

    if (params.q) {
      const q = params.q.trim();
      whereBranch.OR = [
        { branch: { contains: q, mode: "insensitive" } },
        { repo: { contains: q, mode: "insensitive" } },
        { suggestedJiraKey: { contains: q, mode: "insensitive" } },
        { prTitle: { contains: q, mode: "insensitive" } },
      ];
    }
    if (params.repo && params.repo !== "ALL") {
      whereBranch.repo = params.repo;
    }

    const [rows, totalItems] = await Promise.all([
      prisma.branchInfo.findMany({
        where: whereBranch,
        orderBy: { checkedAt: "desc" },
        skip: (pageIndex - 1) * pageSize,
        take: pageSize,
      }),
      prisma.branchInfo.count({ where: whereBranch }),
    ]);

    // Fetch related issue summaries for suggestions
    const keys = Array.from(new Set(rows.map((r) => r.suggestedJiraKey).filter(Boolean))) as string[];
    const issues = await prisma.issueCache.findMany({
      where: { jiraKey: { in: keys } },
      select: {
        jiraKey: true,
        summary: true,
        status: true,
        statusCategory: true,
        assigneeJira: true,
      },
    });
    const issueMap = new Map(issues.map((i) => [i.jiraKey, i]));

    const reviewItems: ReviewSuggestionItem[] = rows.map((r) => ({
      id: r.id,
      repo: r.repo,
      branch: r.branch,
      suggestedJiraKey: r.suggestedJiraKey!,
      prTitle: r.prTitle,
      prUrl: r.prUrl,
      linkSource: r.linkSource,
      linkConfidence: r.linkConfidence,
      checkedAt: r.checkedAt.toISOString(),
      task: r.suggestedJiraKey ? issueMap.get(r.suggestedJiraKey) ?? null : null,
    }));

    return {
      tasks: [],
      reviewItems,
      page: {
        index: pageIndex,
        size: pageSize,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
      },
      counts: {
        myWork: countMyWork,
        needsAttention: 0, // will be evaluated
        pendingReview: countPendingReview,
        unlinked: countUnlinked,
        allBranches: countAllBranches,
      },
    };
  }

  // If view is unlinked: return UnlinkedBranchItem list
  if (view === "unlinked") {
    const whereBranch: Prisma.BranchInfoWhereInput = {
      deletedAt: null,
      jiraKey: null,
      suggestedJiraKey: null,
      linkState: { notIn: ["rejected", "manual_unlinked"] },
    };

    if (params.q) {
      const q = params.q.trim();
      whereBranch.OR = [
        { branch: { contains: q, mode: "insensitive" } },
        { repo: { contains: q, mode: "insensitive" } },
      ];
    }
    if (params.repo && params.repo !== "ALL") {
      whereBranch.repo = params.repo;
    }

    const [rows, totalItems] = await Promise.all([
      prisma.branchInfo.findMany({
        where: whereBranch,
        orderBy: [{ lastCommitAt: { sort: "desc", nulls: "last" } }, { checkedAt: "desc" }],
        skip: (pageIndex - 1) * pageSize,
        take: pageSize,
      }),
      prisma.branchInfo.count({ where: whereBranch }),
    ]);

    const unlinkedItems: UnlinkedBranchItem[] = rows.map((r) => ({
      id: r.id,
      repo: r.repo,
      branch: r.branch,
      latestCommitSha: r.latestCommitSha,
      lastCommitAt: r.lastCommitAt ? r.lastCommitAt.toISOString() : null,
      prId: r.prId,
      prTitle: r.prTitle,
      prUrl: r.prUrl,
      prState: r.prState,
      checkedAt: r.checkedAt.toISOString(),
    }));

    return {
      tasks: [],
      unlinkedItems,
      page: {
        index: pageIndex,
        size: pageSize,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
      },
      counts: {
        myWork: countMyWork,
        needsAttention: 0,
        pendingReview: countPendingReview,
        unlinked: countUnlinked,
        allBranches: countAllBranches,
      },
    };
  }

  // For `my-work` or `needs-attention`: query IssueCache joined with BranchInfo
  const andIssueConditions: Prisma.IssueCacheWhereInput[] = [
    { deletedAt: null },
    {
      branches: {
        some: {
          deletedAt: null,
          linkState: { notIn: ["rejected", "manual_unlinked"] },
        },
      },
    },
  ];

  if (view === "my-work" && params.userAliases && params.userAliases.length > 0) {
    andIssueConditions.push({ assigneeJira: { in: params.userAliases } });
  }

  if (params.project && params.project !== "ALL") {
    andIssueConditions.push({ projectKey: params.project });
  }

  if (params.taskStatus && params.taskStatus !== "ALL") {
    andIssueConditions.push({ status: params.taskStatus });
  }

  if (params.assignee && params.assignee !== "ALL") {
    if (params.assignee === "unassigned") {
      andIssueConditions.push({ assigneeJira: null });
    } else {
      andIssueConditions.push({ assigneeJira: params.assignee });
    }
  }

  if (params.q && params.q.trim()) {
    const q = params.q.trim();
    andIssueConditions.push({
      OR: [
        { jiraKey: { contains: q, mode: "insensitive" } },
        { summary: { contains: q, mode: "insensitive" } },
        {
          branches: {
            some: {
              deletedAt: null,
              OR: [
                { branch: { contains: q, mode: "insensitive" } },
                { repo: { contains: q, mode: "insensitive" } },
                { prTitle: { contains: q, mode: "insensitive" } },
              ],
            },
          },
        },
      ],
    });
  }

  if (params.repo && params.repo !== "ALL") {
    andIssueConditions.push({
      branches: {
        some: {
          deletedAt: null,
          repo: params.repo,
        },
      },
    });
  }

  if (params.pr && params.pr !== "ALL") {
    if (params.pr === "open") {
      andIssueConditions.push({
        branches: { some: { deletedAt: null, prState: { in: ["OPEN", "open"] } } },
      });
    } else if (params.pr === "merged") {
      andIssueConditions.push({
        branches: { some: { deletedAt: null, OR: [{ prState: { in: ["MERGED", "merged"] } }, { merged: true }] } },
      });
    }
  }

  // Needs-attention condition at database level:
  // 1. Task Done but PR OPEN
  // 2. PR MERGED but Task not Done
  // 3. Task active (indeterminate) but has branch without PR
  if (view === "needs-attention") {
    andIssueConditions.push({
      OR: [
        {
          statusCategory: "done",
          branches: { some: { deletedAt: null, prState: { in: ["OPEN", "open"] } } },
        },
        {
          statusCategory: { not: "done" },
          branches: { some: { deletedAt: null, OR: [{ prState: { in: ["MERGED", "merged"] } }, { merged: true }] } },
        },
        {
          statusCategory: "indeterminate",
          branches: { some: { deletedAt: null, prState: null } },
        },
      ],
    });
  }

  const whereIssue: Prisma.IssueCacheWhereInput = { AND: andIssueConditions };

  const [issueRows, totalItems, countNeedsAttention] = await Promise.all([
    prisma.issueCache.findMany({
      where: whereIssue,
      orderBy: [{ statusChangedAt: { sort: "desc", nulls: "last" } }, { updatedAt: { sort: "desc", nulls: "last" } }],
      skip: (pageIndex - 1) * pageSize,
      take: pageSize,
      include: {
        branches: {
          where: {
            deletedAt: null,
            linkState: { notIn: ["rejected", "manual_unlinked"] },
          },
          orderBy: { checkedAt: "desc" },
        },
      },
    }),
    prisma.issueCache.count({ where: whereIssue }),
    prisma.issueCache.count({
      where: {
        deletedAt: null,
        OR: [
          {
            statusCategory: "done",
            branches: { some: { deletedAt: null, prState: { in: ["OPEN", "open"] } } },
          },
          {
            statusCategory: { not: "done" },
            branches: { some: { deletedAt: null, OR: [{ prState: { in: ["MERGED", "merged"] } }, { merged: true }] } },
          },
          {
            statusCategory: "indeterminate",
            branches: { some: { deletedAt: null, prState: null } },
          },
        ],
      },
    }),
  ]);

  const tasks: DeliveryTaskRow[] = issueRows.map((issue) => {
    const branches: DeliveryBranchSummary[] = issue.branches.map((b) => ({
      id: b.id,
      repo: b.repo,
      branch: b.branch,
      latestCommitSha: b.latestCommitSha,
      lastCommitAt: b.lastCommitAt ? b.lastCommitAt.toISOString() : null,
      prId: b.prId,
      prTitle: b.prTitle,
      prUrl: b.prUrl,
      prState: b.prState,
      prDestinationBranch: b.prDestinationBranch,
      merged: b.merged,
    }));

    const repos = Array.from(new Set(issue.branches.map((b) => b.repo)));

    const prSummary = {
      open: 0,
      merged: 0,
      declined: 0,
      closed: 0,
      none: 0,
    };

    const attentionSignals: AttentionSignal[] = [];
    const nextActionsSet = new Set<string>();

    for (const b of issue.branches) {
      const state = (b.prState ?? "").toUpperCase();
      if (state === "OPEN") prSummary.open++;
      else if (state === "MERGED" || b.merged) prSummary.merged++;
      else if (state === "DECLINED") prSummary.declined++;
      else if (state === "CLOSED") prSummary.closed++;
      else prSummary.none++;

      const branchSignals = evaluateBranchAttention({
        jiraKey: issue.jiraKey,
        taskStatus: issue.status,
        taskStatusCategory: issue.statusCategory,
        prState: b.prState,
        merged: b.merged,
      });

      for (const sig of branchSignals) {
        if (!attentionSignals.some((s) => s.rule === sig.rule)) {
          attentionSignals.push(sig);
        }
        if (sig.nextAction) {
          nextActionsSet.add(sig.nextAction);
        }
      }
    }

    return {
      jiraKey: issue.jiraKey,
      summary: issue.summary,
      status: issue.status,
      statusCategory: issue.statusCategory,
      assigneeJira: issue.assigneeJira,
      priority: issue.priority,
      points: issue.points,
      dueDate: issue.dueDate ? issue.dueDate.toISOString() : null,
      branches,
      branchCount: branches.length,
      repositories: repos,
      prSummary,
      attention: attentionSignals,
      nextActions: Array.from(nextActionsSet),
    };
  });

  return {
    tasks,
    page: {
      index: pageIndex,
      size: pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    },
    counts: {
      myWork: countMyWork,
      needsAttention: countNeedsAttention,
      pendingReview: countPendingReview,
      unlinked: countUnlinked,
      allBranches: countAllBranches,
    },
  };
}
