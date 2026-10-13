import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { extractEpicKey } from "@/lib/issues/epic";
import {
  type BulkFilterCriteria,
  type BulkSelector,
  MAX_FILTER_KEYS,
} from "./contracts";

/**
 * Resolve matching Jira issue keys from local DB cache for a filter selector.
 * Allows bulk operations on large task sets (>1000) matching criteria without client truncation.
 */
export async function resolveFilterKeys(
  project: string,
  filters: BulkFilterCriteria,
  jiraUsername?: string | null,
  maxKeys: number = MAX_FILTER_KEYS
): Promise<string[]> {
  const where: Prisma.IssueCacheWhereInput = {
    deletedAt: null,
    projectKey: project.trim().toUpperCase(),
  };

  if (filters.statuses && filters.statuses.length > 0) {
    if (filters.statuses.length === 1) {
      where.status = filters.statuses[0];
    } else {
      where.status = { in: filters.statuses };
    }
  }

  if (filters.priorities && filters.priorities.length > 0) {
    if (filters.priorities.length === 1) {
      where.priority = filters.priorities[0];
    } else {
      where.priority = { in: filters.priorities };
    }
  }

  if (filters.labels && filters.labels.length > 0) {
    if (filters.labels.length === 1) {
      where.labels = { has: filters.labels[0] };
    } else {
      where.labels = { hasSome: filters.labels };
    }
  }

  if (filters.q && filters.q.trim()) {
    const qTrimmed = filters.q.trim();
    where.OR = [
      { jiraKey: { contains: qTrimmed, mode: "insensitive" } },
      { summary: { contains: qTrimmed, mode: "insensitive" } },
    ];
  }

  const rawAssignees = filters.assignees;
  const isAll =
    !rawAssignees ||
    rawAssignees === "ALL" ||
    (Array.isArray(rawAssignees) &&
      (rawAssignees.length === 0 || rawAssignees.some((a) => a.toLowerCase() === "all")));

  if (!isAll && Array.isArray(rawAssignees)) {
    const tokens = rawAssignees.map((a) => a.trim()).filter(Boolean);
    const hasUnassigned = tokens.some(
      (a) => a.toLowerCase() === "unassigned" || a.toLowerCase() === "none"
    );
    const namedTokens = tokens
      .filter((a) => a.toLowerCase() !== "unassigned" && a.toLowerCase() !== "none")
      .map((a) => (a.toLowerCase() === "me" && jiraUsername ? jiraUsername : a));

    if (namedTokens.length > 0 && hasUnassigned) {
      const assigneeConditions: Prisma.IssueCacheWhereInput[] = [
        { assigneeJira: { in: namedTokens } },
        { assigneeJira: null },
        { assigneeJira: "" },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: assigneeConditions }];
        delete where.OR;
      } else {
        where.OR = assigneeConditions;
      }
    } else if (namedTokens.length > 0) {
      where.assigneeJira = { in: namedTokens };
    } else if (hasUnassigned) {
      const unassignedConditions: Prisma.IssueCacheWhereInput[] = [
        { assigneeJira: null },
        { assigneeJira: "" },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: unassignedConditions }];
        delete where.OR;
      } else {
        where.OR = unassignedConditions;
      }
    }
  }

  if (filters.types && filters.types.length > 0) {
    if (filters.types.length === 1) {
      where.type = filters.types[0];
    } else {
      where.type = { in: filters.types };
    }
  }

  if (filters.reporters && filters.reporters.length > 0) {
    if (filters.reporters.length === 1) {
      where.reporterJira = filters.reporters[0];
    } else {
      where.reporterJira = { in: filters.reporters };
    }
  }

  if (filters.approvers && filters.approvers.length > 0) {
    if (filters.approvers.length === 1) {
      where.approverJira = filters.approvers[0];
    } else {
      where.approverJira = { in: filters.approvers };
    }
  }

  if (filters.testers && filters.testers.length > 0) {
    if (filters.testers.length === 1) {
      where.testerJira = filters.testers[0];
    } else {
      where.testerJira = { in: filters.testers };
    }
  }

  if (filters.fixVersions && filters.fixVersions.length > 0) {
    if (filters.fixVersions.length === 1) {
      where.fixVersionNames = { has: filters.fixVersions[0] };
    } else {
      where.fixVersionNames = { hasSome: filters.fixVersions };
    }
  }

  if (filters.roles && filters.roles.length > 0 && jiraUsername) {
    const roleConditions: Prisma.IssueCacheWhereInput[] = [];
    for (const role of filters.roles) {
      const r = role.toLowerCase();
      if (r === "assignee") roleConditions.push({ assigneeJira: jiraUsername });
      if (r === "reporter") roleConditions.push({ reporterJira: jiraUsername });
      if (r === "approver") roleConditions.push({ approverJira: jiraUsername });
      if (r === "tester") roleConditions.push({ testerJira: jiraUsername });
    }
    if (roleConditions.length > 0) {
      const existingAnd = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
      where.AND = [...existingAnd, { OR: roleConditions }];
    }
  }

  if (filters.overdue) {
    const existingAnd = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
    where.AND = [
      ...existingAnd,
      { dueDate: { lt: new Date() }, statusCategory: { not: "done" } },
    ];
  }

  if (filters.quickFilter) {
    const qf = filters.quickFilter;
    const existingAnd = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
    if (qf === "overdue") {
      where.AND = [...existingAnd, { dueDate: { lt: new Date() }, statusCategory: { not: "done" } }];
    } else if (qf === "unassigned") {
      where.AND = [...existingAnd, { OR: [{ assigneeJira: null }, { assigneeJira: "" }] }];
    } else if (qf === "unestimated") {
      where.AND = [...existingAnd, { originalEstimateSeconds: null, points: null, statusCategory: { not: "done" } }];
    } else if (qf === "stale") {
      where.AND = [...existingAnd, { updatedAt: { lt: new Date(Date.now() - 7 * 86_400_000) }, statusCategory: { not: "done" } }];
    } else if (qf === "missingApprover") {
      where.AND = [...existingAnd, { OR: [{ approverJira: null }, { approverJira: "" }], statusCategory: { not: "done" } }];
    } else if (qf === "missingTester") {
      where.AND = [...existingAnd, { OR: [{ testerJira: null }, { testerJira: "" }], statusCategory: { not: "done" } }];
    }
  }

  const hasEpicFilter = Boolean(filters.epics && filters.epics.length > 0);

  const rows = await prisma.issueCache.findMany({
    where,
    select: { jiraKey: true, ...(hasEpicFilter ? { raw: true } : {}) },
    orderBy: { jiraKey: "asc" },
    take: maxKeys,
  });

  if (hasEpicFilter && filters.epics) {
    const epicTokens = filters.epics.map((e) => e.trim().toLowerCase());
    const hasUnassigned = epicTokens.some((e) => e === "none" || e === "unassigned");
    const namedEpics = epicTokens.filter((e) => e !== "none" && e !== "unassigned");

    const matched = rows.filter((row) => {
      const epic = extractEpicKey((row as { raw?: unknown }).raw);
      if (!epic) return hasUnassigned;
      return namedEpics.includes(epic.toLowerCase());
    });
    return matched.map((r) => r.jiraKey);
  }

  return rows.map((r) => r.jiraKey);
}

/**
 * Resolve issue keys from either an explicit key selector or a filter selector.
 */
export async function resolveSelectorKeys(
  selector: BulkSelector,
  jiraUsername?: string | null,
  maxKeys: number = MAX_FILTER_KEYS
): Promise<string[]> {
  if (selector.mode === "keys") {
    return selector.keys;
  }
  return resolveFilterKeys(selector.project, selector.filters, jiraUsername, maxKeys);
}
