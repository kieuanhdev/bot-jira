import { prisma } from "@/lib/prisma";
import { sentry } from "@/lib/sentry/client";
import { jira, hasJiraCredentials } from "@/lib/jira/client";
import { upsertJiraIssue } from "@/lib/issues/cache";
import { guard, hasSentryConfig } from "../guard";
import { jiraProjectList, env, parseSentryMappings, resolveJiraProject } from "@/lib/env";
import type { WorkerLog } from "../guard";
import type { JiraIssue } from "@/lib/jira/types";
import { seedSentryIssue } from "@/lib/sentry/review-queue";

import { sentryLabel, isBackoffElapsed } from "@/lib/sentry/idempotency";

const DISCOVER_BATCH = 25;
const CREATE_BATCH = 10;
const MAX_ATTEMPTS = 5;

// Resolved once per run. `mappings` empty => single-project mode (file into
// JIRA_PROJECT_KEYS[0]); non-empty => each issue is filed into its mapped
// project. Rows normally carry `targetProject` from when they were seeded.
const mappings = parseSentryMappings(env.sentryProjectMappings);
const fallbackProject = jiraProjectList[0] ?? null;

type ImportRow = Awaited<ReturnType<typeof prisma.sentryIssueImported.findMany>>[number];

async function findJiraIssueByLabel(label: string): Promise<JiraIssue | null> {
  let projectKeys: string[];
  try {
    const { listSyncEnabledProjectKeys } = await import("@/lib/jira/project-catalog");
    projectKeys = await listSyncEnabledProjectKeys();
  } catch {
    projectKeys = jiraProjectList;
  }
  for (const pk of projectKeys) {
    const jql = `project = ${pk} AND labels = "${label}" ORDER BY created DESC`;
    try {
      const result = await jira.search(jql, 1, 0);
      if (result.issues.length > 0) return result.issues[0];
    } catch {
      /* project may not be accessible; skip */
    }
  }
  return null;
}

/** File one approved row into Jira (or re-link an existing labelled task). */
async function fileRow(row: ImportRow): Promise<{ recovered: boolean }> {
  const label = sentryLabel({ id: row.sentryIssueId });
  let jiraKey: string | null = row.jiraKey;
  let recovered = false;

  if (!jiraKey) {
    const found = await findJiraIssueByLabel(label);
    if (found) {
      jiraKey = found.key;
      recovered = true;
    }
  }

  const targetProject =
    row.targetProject ?? resolveJiraProject(row.sentryProject, mappings, fallbackProject);

  if (!jiraKey) {
    if (!targetProject) {
      throw new Error(`no Jira project mapping for Sentry project "${row.sentryProject}"`);
    }
    const ref = row.shortId ?? row.sentryIssueId;
    const description = [
      "Auto-created from Sentry.",
      "",
      `Sentry issue: ${row.permalinkUrl ?? ref}`,
      `Level: ${row.level ?? "unknown"}`,
      `Count: ${row.eventCount ?? "n/a"}`,
      `First seen: ${row.firstSeen?.toISOString() ?? "n/a"}`,
      `Last seen: ${row.lastSeen?.toISOString() ?? "n/a"}`,
    ].join("\n");

    const created = await jira.createIssue({
      projectKey: targetProject,
      summary: `[Sentry] ${ref}: ${row.title ?? "Sentry issue"}`,
      description,
      issueType: "Bug",
      labels: ["sentry", label],
    });
    jiraKey = created.key;
  }

  if (recovered) {
    const cached = await prisma.issueCache.findUnique({ where: { jiraKey } });
    if (!cached) {
      try {
        const full = await jira.getIssue(jiraKey);
        await upsertJiraIssue(full);
      } catch {
        /* cache upsert is best-effort; the Jira issue exists */
      }
    }
  }

  await prisma.sentryIssueImported.update({
    where: { id: row.id },
    data: {
      jiraKey,
      targetProject,
      state: "created",
      attemptCount: row.attemptCount + 1,
      lastError: null,
      lastAttemptAt: new Date(),
      importedAt: new Date(),
    },
  });

  return { recovered };
}

export async function runSentryImport(): Promise<WorkerLog> {
  if (!hasSentryConfig()) return guard(hasSentryConfig(), "Sentry not configured");
  if (!(await hasJiraCredentials())) return guard(false, "Jira not configured");

  let discovered = 0;
  let imported = 0;
  let recovered = 0;
  let failed = 0;
  const errors: string[] = [];
  let discoverError: string | null = null;

  // 1. Discover: record new unresolved Sentry issues in the review queue.
  try {
    const issues = await sentry.listUnresolvedIssues(DISCOVER_BATCH);
    for (const issue of issues) {
      await seedSentryIssue(issue);
      discovered++;
    }
  } catch (e) {
    discoverError = (e as Error).message.slice(0, 500);
    errors.push(`discover: ${discoverError}`);
  }

  // 2. File: create Jira tasks for approved rows (and failed rows past backoff).
  // Approved rows first, so failed rows sitting in long backoff never starve them.
  const approved = await prisma.sentryIssueImported.findMany({
    where: { state: "approved" },
    orderBy: { updatedAt: "asc" },
    take: CREATE_BATCH,
  });
  const retryable =
    approved.length < CREATE_BATCH
      ? await prisma.sentryIssueImported.findMany({
          where: { state: "failed" },
          orderBy: { lastAttemptAt: "asc" },
          take: 50,
        })
      : [];
  const due = [
    ...approved,
    ...retryable.filter((r) => isBackoffElapsed(r.lastAttemptAt, r.attemptCount)),
  ].slice(0, CREATE_BATCH);

  for (const row of due) {
    // Optimistic claim: a concurrent run (cron + manual trigger) that touched
    // the row first wins, so the same issue is never filed twice.
    const claim = await prisma.sentryIssueImported.updateMany({
      where: { id: row.id, state: row.state, updatedAt: row.updatedAt },
      data: { lastAttemptAt: new Date() },
    });
    if (claim.count !== 1) continue;

    try {
      const result = await fileRow(row);
      if (result.recovered) recovered++;
      else imported++;
    } catch (e) {
      const message = (e as Error).message.slice(0, 500);
      const attempts = row.attemptCount + 1;
      const shouldFail = attempts >= MAX_ATTEMPTS;
      await prisma.sentryIssueImported.update({
        where: { id: row.id },
        data: {
          state: shouldFail ? "failed" : "approved",
          attemptCount: attempts,
          lastError: message,
          lastAttemptAt: new Date(),
        },
      });
      if (shouldFail) failed++;
      errors.push(`${row.shortId ?? row.sentryIssueId}: ${message}`);
    }
  }

  return {
    ok: discoverError === null,
    stats: { discovered, imported, recovered, failed },
    errors,
  };
}
