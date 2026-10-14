import { prisma } from "@/lib/prisma";
import { hasJiraCredentials, jira } from "@/lib/jira/client";
import { listSyncEnabledProjectKeys } from "@/lib/jira/project-catalog";
import { markIssuesDeleted } from "@/lib/issues/deleted";
import type { WorkerLog } from "../guard";

const PAGE_SIZE = 100;
const MAX_PAGES = 200;
// Refuse to mass-delete when the Jira view looks truncated (permissions, outage).
const MAX_DELETE_RATIO = 0.5;
const MIN_ROWS_FOR_RATIO_GUARD = 20;

async function listJiraKeys(projectKey: string): Promise<Set<string> | null> {
  const keys = new Set<string>();
  const jql = `project = "${projectKey}"`;
  for (let page = 0; page < MAX_PAGES; page++) {
    const startAt = page * PAGE_SIZE;
    const result = await jira.searchKeys(jql, PAGE_SIZE, startAt);
    for (const issue of result.issues) keys.add(issue.key);
    if (result.issues.length === 0 || startAt + result.issues.length >= result.total) {
      return keys;
    }
  }
  return null;
}

/**
 * Soft-delete cached issues that disappeared from Jira. Incremental sync and a
 * missing webhook can never see deletions, so this compares key lists per project.
 */
export async function runReconcileDeletedIssues(): Promise<WorkerLog> {
  if (!(await hasJiraCredentials())) {
    return { ok: true, skipped: true, reason: "Jira not configured" };
  }
  const { loadSyncPolicy } = await import("@/lib/jira/sync-features");
  const policy = await loadSyncPolicy();
  const allProjects = await listSyncEnabledProjectKeys();
  const projects = allProjects.filter((key) => policy.isEnabled(key, "deletions"));
  const errors: string[] = [];
  let deleted = 0;
  let checked = 0;

  for (const projectKey of projects) {
    try {
      // Snapshot the cache first so an issue created mid-scan is never mistaken for deleted.
      const cached = await prisma.issueCache.findMany({
        where: { projectKey, deletedAt: null },
        select: { jiraKey: true },
      });
      if (cached.length === 0) continue;

      const jiraKeys = await listJiraKeys(projectKey);
      if (!jiraKeys) {
        errors.push(`${projectKey}: too many pages, skipped`);
        continue;
      }
      checked++;
      const missing = cached.map((row) => row.jiraKey).filter((key) => !jiraKeys.has(key));
      if (missing.length === 0) continue;
      if (
        jiraKeys.size === 0 ||
        (cached.length >= MIN_ROWS_FOR_RATIO_GUARD &&
          missing.length / cached.length > MAX_DELETE_RATIO)
      ) {
        errors.push(`${projectKey}: ${missing.length}/${cached.length} missing, skipped as suspicious`);
        continue;
      }
      deleted += await markIssuesDeleted(missing);
    } catch (error) {
      errors.push(`${projectKey}: ${(error instanceof Error ? error.message : String(error)).slice(0, 300)}`);
    }
  }
  return { ok: errors.length === 0, stats: { projects: projects.length, checked, deleted }, errors };
}
