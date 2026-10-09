import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { normalizeProjectKey } from "@/lib/jira/project-catalog";
import type { ReportIssueInput } from "./metrics";
import { normalizeStatusToGroup, isDoneGroup } from "./status";
import { resolveCompletionDate } from "./completion-date";

/**
 * Standard Prisma select fields for Report issues across all report queries.
 */
export const REPORT_ISSUE_SELECT = {
  jiraKey: true,
  projectKey: true,
  summary: true,
  status: true,
  statusCategory: true,
  statusChangedAt: true,
  assigneeJira: true,
  priority: true,
  points: true,
  originalEstimateSeconds: true,
  timeSpent: true,
  dueDate: true,
  createdAt: true,
  updatedAt: true,
  labels: true,
  raw: true,
  lastSyncedAt: true,
} as const;

/**
 * Extended select for task explorer view that includes fixVersionNames.
 */
export const REPORT_TASK_EXPLORER_SELECT = {
  ...REPORT_ISSUE_SELECT,
  fixVersionNames: true,
} as const;

export type RawReportIssueRecord = Prisma.IssueCacheGetPayload<{
  select: typeof REPORT_ISSUE_SELECT;
}>;

export type RawReportTaskRecord = Prisma.IssueCacheGetPayload<{
  select: typeof REPORT_TASK_EXPLORER_SELECT;
}>;

/**
 * Pure mapper from a raw Prisma IssueCache record to domain ReportIssueInput.
 */
export function mapIssueRecordToReportInput(
  record: RawReportIssueRecord
): ReportIssueInput {
  return {
    jiraKey: record.jiraKey,
    projectKey: record.projectKey,
    summary: record.summary,
    status: record.status,
    statusCategory: record.statusCategory,
    statusChangedAt: record.statusChangedAt,
    assigneeJira: record.assigneeJira,
    priority: record.priority,
    points: record.points,
    originalEstimateSeconds: record.originalEstimateSeconds,
    timeSpent: record.timeSpent,
    dueDate: record.dueDate,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    labels: record.labels,
    raw: record.raw,
  };
}

/**
 * Constructs a standardized Prisma where clause for project issues in reports.
 */
export function buildProjectIssueWhere(
  projectKey: string,
  versionWhere?: Prisma.IssueCacheWhereInput | null
): Prisma.IssueCacheWhereInput {
  const normalizedKey = normalizeProjectKey(projectKey);
  return {
    projectKey: normalizedKey,
    deletedAt: null,
    ...(versionWhere || {}),
  };
}

/**
 * Fetches all issues in a project scope and maps them to ReportIssueInput.
 */
export async function fetchProjectReportIssues(
  projectKey: string,
  versionWhere?: Prisma.IssueCacheWhereInput | null
): Promise<{
  rawIssues: RawReportIssueRecord[];
  mappedIssues: ReportIssueInput[];
}> {
  const whereClause = buildProjectIssueWhere(projectKey, versionWhere);
  const rawIssues = await prisma.issueCache.findMany({
    where: whereClause,
    select: REPORT_ISSUE_SELECT,
  });

  const mappedIssues = rawIssues.map(mapIssueRecordToReportInput);
  return { rawIssues, mappedIssues };
}

/**
 * Fetches issues for portfolio reporting and computes the maximum lastSyncedAt.
 */
export async function fetchPortfolioProjectIssues(
  projectKey: string
): Promise<{
  rawIssues: RawReportIssueRecord[];
  mappedIssues: ReportIssueInput[];
  lastSyncedAt: Date | null;
}> {
  const { rawIssues, mappedIssues } = await fetchProjectReportIssues(projectKey);
  let lastSyncedAt: Date | null = null;
  for (const raw of rawIssues) {
    if (raw.lastSyncedAt && (!lastSyncedAt || raw.lastSyncedAt > lastSyncedAt)) {
      lastSyncedAt = raw.lastSyncedAt;
    }
  }
  return { rawIssues, mappedIssues, lastSyncedAt };
}

/**
 * Fetches a map of Jira usernames to user display names.
 * Deduplicates input usernames and filters out empty or null entries.
 */
export async function fetchAssigneeDisplayNameMap(
  assigneeJiraUsernames: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const uniqueKeys = [
    ...new Set(
      assigneeJiraUsernames.filter(
        (a): a is string => typeof a === "string" && a.trim() !== ""
      )
    ),
  ];

  if (uniqueKeys.length === 0) {
    return new Map();
  }

  const users = await prisma.user.findMany({
    where: { jiraUsername: { in: uniqueKeys } },
    select: { jiraUsername: true, displayName: true },
  });

  const userMap = new Map<string, string>();
  for (const u of users) {
    if (u.jiraUsername) {
      userMap.set(u.jiraUsername, u.displayName);
    }
  }
  return userMap;
}

export interface IssueTransitionEventItem {
  jiraKey: string;
  occurredAt: Date;
  fromStatusGroup: string | null;
  toStatusGroup: string;
}

/**
 * Fetches issue status transition events for a project within a period date window.
 */
export async function fetchIssueTransitionEvents(
  projectKey: string,
  bounds: { startDate: Date; endDate: Date }
): Promise<IssueTransitionEventItem[]> {
  const normalizedKey = normalizeProjectKey(projectKey);
  if (!prisma.issueTransitionEvent) {
    return [];
  }

  return prisma.issueTransitionEvent.findMany({
    where: {
      projectKey: normalizedKey,
      occurredAt: {
        gte: bounds.startDate,
        lte: bounds.endDate,
      },
    },
    select: {
      jiraKey: true,
      occurredAt: true,
      fromStatusGroup: true,
      toStatusGroup: true,
    },
  });
}

/**
 * Returns UTC start-of-day and end-of-day Date objects for a YYYY-MM-DD period.
 */
export function getPeriodDateBounds(period: { from: string; to: string }): {
  startDate: Date;
  endDate: Date;
} {
  return {
    startDate: new Date(`${period.from}T00:00:00.000Z`),
    endDate: new Date(`${period.to}T23:59:59.999Z`),
  };
}

/**
 * Checks whether an issue is relevant to a reporting period:
 * - Excludes issues created after period end
 * - Includes non-done issues
 * - Includes issues completed in period
 * - Includes issues completed after period end (active during period)
 * - Excludes issues completed before period start
 * - Excludes issues whose last update was before period start (and have no completion date)
 */
export function isIssueRelevantToPeriod(
  issue: ReportIssueInput,
  startDate: Date,
  endDate: Date,
  completedIssueKeys?: Set<string>
): boolean {
  if (issue.createdAt && issue.createdAt.getTime() > endDate.getTime()) {
    return false;
  }

  const group = normalizeStatusToGroup(issue.status, issue.statusCategory);
  if (!isDoneGroup(group)) {
    return true;
  }

  if (completedIssueKeys?.has(issue.jiraKey)) {
    return true;
  }

  const resolved = resolveCompletionDate({
    status: issue.status,
    statusCategory: issue.statusCategory,
    statusChangedAt: issue.statusChangedAt,
    raw: issue.raw,
  });

  const completionDate = resolved.date || issue.statusChangedAt;
  if (completionDate) {
    if (completionDate.getTime() > endDate.getTime()) {
      return true;
    }
    if (completionDate.getTime() < startDate.getTime()) {
      return false;
    }
    return true;
  }

  if (issue.updatedAt && issue.updatedAt.getTime() < startDate.getTime()) {
    return false;
  }

  return false;
}

/**
 * Filters a list of issues to those relevant to the reporting period.
 */
export function filterIssuesForPeriod(
  issues: ReportIssueInput[],
  startDate: Date,
  endDate: Date,
  completedIssueKeys?: Set<string>
): ReportIssueInput[] {
  return issues.filter((i) =>
    isIssueRelevantToPeriod(i, startDate, endDate, completedIssueKeys)
  );
}

/**
 * Filters user's allowed project keys by requested project keys.
 * Returns all allowed projects if no filter is requested.
 */
export function resolveScopedProjectKeys(
  allowedProjects: string[],
  filterProjects?: string[]
): string[] {
  if (!filterProjects || filterProjects.length === 0) {
    return [...allowedProjects];
  }
  const requested = new Set(filterProjects.map(normalizeProjectKey));
  return allowedProjects.filter((k) => requested.has(normalizeProjectKey(k)));
}

export interface AvailableReleaseVersion {
  id: string;
  name: string;
  released: boolean;
  releaseDate: string | null;
  startDate: string | null;
}

/**
 * Retrieves available release versions for a project from the Release table.
 */
export async function fetchAvailableProjectVersions(
  projectKey: string
): Promise<AvailableReleaseVersion[]> {
  const normalizedKey = normalizeProjectKey(projectKey);
  const releases = await prisma.release.findMany({
    where: { projectKey: normalizedKey },
    orderBy: [{ releaseDate: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      jiraVersionId: true,
      version: true,
      releaseDate: true,
      status: true,
      createdAt: true,
    },
  });

  return releases.map((r) => ({
    id: r.jiraVersionId || r.id,
    name: r.version,
    released: r.status === "released",
    releaseDate: r.releaseDate ? r.releaseDate.toISOString().split("T")[0] : null,
    startDate: r.createdAt ? r.createdAt.toISOString().split("T")[0] : null,
  }));
}

export interface ReferenceReleaseSummary {
  id: string;
  name: string;
  releaseDate: string | null;
}

/**
 * Retrieves the primary unreleased reference release for a project.
 */
export async function fetchReferenceRelease(
  projectKey: string
): Promise<ReferenceReleaseSummary | null> {
  const normalizedKey = normalizeProjectKey(projectKey);
  const release = await prisma.release.findFirst({
    where: {
      projectKey: normalizedKey,
      archived: false,
      status: { not: "released" },
    },
    orderBy: [{ releaseDate: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      jiraVersionId: true,
      version: true,
      releaseDate: true,
    },
  });

  if (!release) return null;

  return {
    id: release.jiraVersionId || release.id,
    name: release.version,
    releaseDate: release.releaseDate
      ? release.releaseDate.toISOString().split("T")[0]
      : null,
  };
}

/**
 * Parses period-related query parameters from URL search params.
 */
export function parsePeriodQueryParams(searchParams: URLSearchParams): {
  period: string | null;
  from: string | null;
  to: string | null;
  timezone: string | null;
} {
  return {
    period: searchParams.get("period"),
    from: searchParams.get("from"),
    to: searchParams.get("to"),
    timezone: searchParams.get("timezone"),
  };
}

/**
 * Parses pagination query parameters (limit and offset) with safe bounds.
 */
export function parsePaginationParams(
  searchParams: URLSearchParams,
  defaults: { limit?: number; maxLimit?: number; offset?: number } = {}
): { limit: number; offset: number } {
  const defaultLimit = defaults.limit ?? 50;
  const maxLimit = defaults.maxLimit ?? 100;
  const rawLimit = searchParams.get("limit");
  const rawOffset = searchParams.get("offset");

  const parsedLimit = rawLimit ? parseInt(rawLimit, 10) : defaultLimit;
  const parsedOffset = rawOffset ? parseInt(rawOffset, 10) : (defaults.offset ?? 0);

  const limit = isNaN(parsedLimit)
    ? defaultLimit
    : Math.min(Math.max(parsedLimit, 1), maxLimit);
  const offset = isNaN(parsedOffset) ? 0 : Math.max(parsedOffset, 0);

  return { limit, offset };
}
