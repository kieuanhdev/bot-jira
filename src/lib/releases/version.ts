/**
 * Version-mapping helpers for M3-01: releases are identified by a Jira Fix
 * Version, and the set of tasks in a release is derived from the issues whose
 * `fixVersionIds` contain that version — not from a frozen label snapshot.
 *
 * These are pure functions so the mapping logic can be unit tested without a
 * Jira/DB dependency.
 */

/** A task as projected for the release ready-check. */
export type ReleaseTask = {
  jiraKey: string;
  summary: string;
  description: string;
  priority: string;
  status: string;
  statusCategory: string;
  lastSyncedAt: Date;
  fixVersionIds: string[];
};

/**
 * Return the tasks in a release, identified by Jira Fix Version. An issue
 * belongs to the release when its `fixVersionIds` includes the given version
 * id. Excludes soft-deleted issues.
 *
 * Jira is the source of truth for which issues carry a version, so this query
 * must run against the live `IssueCache` (never a stale snapshot).
 */
export function tasksForFixVersion(
  issues: {
    jiraKey: string;
    summary: string;
    description: string;
    priority: string;
    status: string;
    statusCategory: string;
    lastSyncedAt: Date;
    fixVersionIds: string[];
    deletedAt: Date | null;
  }[],
  jiraVersionId: string
): ReleaseTask[] {
  if (!jiraVersionId) return [];
  return issues
    .filter((i) => !i.deletedAt && i.fixVersionIds.includes(jiraVersionId))
    .map((i) => ({
      jiraKey: i.jiraKey,
      summary: i.summary,
      description: i.description,
      priority: i.priority,
      status: i.status,
      statusCategory: i.statusCategory,
      lastSyncedAt: i.lastSyncedAt,
      fixVersionIds: i.fixVersionIds,
    }));
}

/**
 * Derive the Prisma `where` clause that selects the issues in a release from
 * the live IssueCache. Used by the ready-check route to query by Fix Version.
 */
export function fixVersionWhere(jiraVersionId: string) {
  return {
    deletedAt: null,
    fixVersionIds: { has: jiraVersionId },
  };
}
