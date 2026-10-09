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
