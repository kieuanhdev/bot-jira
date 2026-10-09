import type { Prisma } from "@prisma/client";
import { parseJiraDate } from "@/lib/jira/client";
import { normalizeIssueLink, type NormalizedIssueLink } from "@/lib/jira/issue-links";
import type { JiraComment, JiraIssue } from "@/lib/jira/types";
import { extractEpicKey } from "@/lib/issues/epic";

export type JiraPointsMapping = {
  points: number | null;
  fieldId: string | null;
};

export type IssueMappingContext = {
  peopleFields: {
    reporter: string;
    approver: string;
    tester: string;
  };
  points: JiraPointsMapping;
  epicLinkFieldIds: readonly string[];
  syncedAt: Date;
};

export type JiraCommentCacheData = {
  jiraCommentId: string;
  jiraKey: string;
  author: string;
  body: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};

function descriptionText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function jiraUsername(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const user = value as { name?: unknown };
  return typeof user.name === "string" && user.name.trim() ? user.name : null;
}

function originalEstimateSeconds(fields: JiraIssue["fields"]): number | null {
  if (typeof fields.timeoriginalestimate === "number" && Number.isFinite(fields.timeoriginalestimate)) {
    return Math.round(fields.timeoriginalestimate);
  }

  const trackedEstimate =
    fields.timetracking && typeof fields.timetracking === "object"
      ? (fields.timetracking as Record<string, unknown>).originalEstimateSeconds
      : undefined;
  if (typeof trackedEstimate === "number" && Number.isFinite(trackedEstimate)) {
    return Math.round(trackedEstimate);
  }

  if (
    typeof fields.timeoriginalestimate === "string" &&
    fields.timeoriginalestimate.trim() !== "" &&
    !Number.isNaN(Number(fields.timeoriginalestimate))
  ) {
    return Math.round(Number(fields.timeoriginalestimate));
  }

  return null;
}

/** Map a Jira issue payload into IssueCache data without database or network access. */
export function mapJiraIssueToCacheData(issue: JiraIssue, context: IssueMappingContext) {
  const fields = issue.fields;
  const fixVersions = fields.fixVersions ?? [];
  const { peopleFields, points, epicLinkFieldIds, syncedAt } = context;

  return {
    projectKey: fields.project?.key ?? issue.key.split("-")[0] ?? "",
    summary: fields.summary ?? "",
    description: descriptionText(fields.description),
    status: fields.status?.name ?? "",
    statusId: fields.status?.id ?? null,
    statusCategory: fields.status?.statusCategory?.key?.toLowerCase() ?? "unknown",
    statusChangedAt:
      parseJiraDate((fields as Record<string, unknown>).customfield_10706 as string | undefined) ??
      parseJiraDate((fields as Record<string, unknown>).resolutiondate as string | undefined) ??
      parseJiraDate(fields.statuscategorychangedate) ??
      null,
    assigneeJira: fields.assignee?.name ?? null,
    reporterJira: jiraUsername(fields[peopleFields.reporter]),
    approverJira: jiraUsername(fields[peopleFields.approver]),
    testerJira: jiraUsername(fields[peopleFields.tester]),
    epicKey: extractEpicKey(fields, epicLinkFieldIds),
    labels: fields.labels ?? [],
    fixVersionIds: fixVersions.flatMap((version) => (version.id ? [version.id] : [])),
    fixVersionNames: fixVersions.flatMap((version) => (version.name ? [version.name] : [])),
    priority: fields.priority?.name ?? "",
    points: points.points,
    storyField: points.fieldId,
    type: fields.issuetype?.name ?? "",
    dueDate: parseJiraDate(fields.duedate as string | undefined) ?? null,
    timeSpent: typeof fields.timespent === "number" ? fields.timespent : null,
    originalEstimateSeconds: originalEstimateSeconds(fields),
    createdAt: parseJiraDate(fields.created) ?? null,
    updatedAt: parseJiraDate(fields.updated) ?? null,
    lastSyncedAt: syncedAt,
    deletedAt: null,
    raw: JSON.parse(JSON.stringify(fields)) as Prisma.InputJsonValue,
  };
}

/** Map one usable Jira comment; empty bodies and missing ids are intentionally ignored. */
export function mapJiraCommentToCacheData(
  jiraKey: string,
  comment: JiraComment
): JiraCommentCacheData | null {
  const body = descriptionText(comment.body).trim();
  if (!body || !comment.id) return null;

  return {
    jiraCommentId: comment.id,
    jiraKey,
    author: comment.author?.displayName || comment.author?.name || "unknown",
    body,
    createdAt: parseJiraDate(comment.created) ?? null,
    updatedAt: parseJiraDate(comment.updated) ?? null,
  };
}

/** Normalize active Jira dependency links without persistence or cache timestamps. */
export function mapJiraIssueLinks(
  issueKey: string,
  rawLinks: JiraIssue["fields"]["issuelinks"],
  options: { linkTypeName: string; inwardLabel: string }
): NormalizedIssueLink[] {
  if (!Array.isArray(rawLinks)) return [];
  const key = issueKey.trim().toUpperCase();
  return rawLinks
    .map((link) => normalizeIssueLink(key, link, options))
    .filter((link): link is NormalizedIssueLink => link !== null);
}
