import { prisma } from "@/lib/prisma";
import { sentry, sentryWith, sanitizeSentryErrorMessage } from "@/lib/sentry/client";
import { userSentryCreds } from "@/lib/user-creds";
import { buildSentryTaskDraft } from "@/lib/sentry/task-draft";
import { jira, hasJiraCredentials } from "@/lib/jira/client";
import { upsertJiraIssue } from "@/lib/issues/cache";
import { guard, hasSentryConfig, hasSentryWebhookConfig } from "../guard";
import { jiraProjectList, env, parseSentryMappings, resolveJiraProject } from "@/lib/env";
import type { WorkerLog } from "../guard";
import type { JiraIssue } from "@/lib/jira/types";
import { seedSentryIssue } from "@/lib/sentry/review-queue";
import { hasInflightSentryOp } from "@/lib/sentry/create-from-form";
import { enrichSentryRows } from "@/lib/sentry/enrich";

import { sentryLabel, isBackoffElapsed } from "@/lib/sentry/idempotency";

const DISCOVER_BATCH = 25;
// The job expires after 120s: cap per-user polling so a pile of slow or broken
// tokens cannot starve the Jira filing step.
const USER_POLL_MAX_PAIRS = 12;
const USER_POLL_CONCURRENCY = 4;
const USER_POLL_TIMEOUT_MS = 8_000;
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
    const draft = buildSentryTaskDraft(row);

    const created = await jira.createIssue({
      projectKey: targetProject,
      summary: row.draftSummary ?? draft.summary,
      description: row.draftDescription ?? draft.description,
      issueType: draft.issueType,
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

type PollUser = {
  id: string;
  sentryOrg: string | null;
  sentryMappings: string | null;
  sentryTokenEnc: string | null;
  sentryLastError: string | null;
};

type PollTarget = {
  userId: string;
  org: string;
  token: string;
  slug: string;
  jiraProject: string;
};

async function loadSentryUsers(): Promise<PollUser[]> {
  try {
    return await prisma.user.findMany({
      where: { sentryTokenEnc: { not: null } },
      select: {
        id: true,
        sentryOrg: true,
        sentryMappings: true,
        sentryTokenEnc: true,
        sentryLastError: true,
      },
    });
  } catch {
    return [];
  }
}

/** One (org, slug) pair is polled once even if several users configured it. */
function buildPollTargets(users: PollUser[]): PollTarget[] {
  const seen = new Set<string>();
  const targets: PollTarget[] = [];
  for (const user of users) {
    const creds = userSentryCreds(user);
    if (!creds) continue;
    for (const m of creds.mappings) {
      const key = `${creds.org}/${m.sentryProject}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push({
        userId: user.id,
        org: creds.org,
        token: creds.token,
        slug: m.sentryProject,
        jiraProject: m.jiraProject,
      });
    }
  }
  return targets.slice(0, USER_POLL_MAX_PAIRS);
}

/** Poll every user-configured Sentry project; a failing user never aborts the rest. */
async function discoverFromUsers(
  users: PollUser[]
): Promise<{ discovered: number; errors: string[] }> {
  const targets = buildPollTargets(users);
  const failedUsers = new Set<string>();
  const errors: string[] = [];
  let discovered = 0;

  for (let i = 0; i < targets.length; i += USER_POLL_CONCURRENCY) {
    const batch = targets.slice(i, i + USER_POLL_CONCURRENCY);
    await Promise.all(
      batch.map(async (t) => {
        try {
          const issues = await sentryWith({ org: t.org, project: t.slug, token: t.token })
            .listUnresolvedIssues(DISCOVER_BATCH, { timeoutMs: USER_POLL_TIMEOUT_MS });
          for (const issue of issues) {
            await seedSentryIssue(issue, { projectSlug: t.slug, targetProject: t.jiraProject });
            discovered++;
          }
        } catch (e) {
          failedUsers.add(t.userId);
          const message = sanitizeSentryErrorMessage((e as Error).message);
          errors.push(`user ${t.userId} ${t.slug}: ${message}`);
          await prisma.user
            .update({ where: { id: t.userId }, data: { sentryLastError: message.slice(0, 200) } })
            .catch(() => undefined);
        }
      })
    );
  }

  // Clear a stale error once the user's token works again.
  for (const user of users) {
    if (user.sentryLastError && !failedUsers.has(user.id) && userSentryCreds(user)) {
      await prisma.user
        .update({ where: { id: user.id }, data: { sentryLastError: null, sentryVerifiedAt: new Date() } })
        .catch(() => undefined);
    }
  }
  return { discovered, errors };
}

export async function runSentryImport(): Promise<WorkerLog> {
  // Polling needs an API token (system or per-user); webhook-only mode (signing
  // secret) still files approved rows into Jira, it just skips discovery.
  const canPoll = hasSentryConfig();
  const sentryUsers = await loadSentryUsers();
  if (!canPoll && !hasSentryWebhookConfig() && sentryUsers.length === 0) {
    return guard(false, "Sentry not configured");
  }
  if (!(await hasJiraCredentials())) return guard(false, "Jira not configured");

  let discovered = 0;
  let imported = 0;
  let recovered = 0;
  let failed = 0;
  const errors: string[] = [];
  let discoverError: string | null = null;

  // 1. Discover: record new unresolved Sentry issues in the review queue.
  if (canPoll) try {
    const issues = await sentry.listUnresolvedIssues(DISCOVER_BATCH);
    for (const issue of issues) {
      await seedSentryIssue(issue);
      discovered++;
    }
  } catch (e) {
    discoverError = (e as Error).message.slice(0, 500);
    errors.push(`discover: ${discoverError}`);
  }

  // 1b. Per-user tokens entered in Settings.
  if (sentryUsers.length > 0) {
    const fromUsers = await discoverFromUsers(sentryUsers);
    discovered += fromUsers.discovered;
    errors.push(...fromUsers.errors);
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
    // A single-issue form op for this row is queued/running: filing it here too
    // would duplicate the task. Skip before the claim so the row is untouched;
    // a later run re-links the labelled task the op created.
    if (await hasInflightSentryOp(row.id)) continue;

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

  // 3. Enrich: release/environment for review rows. Last, so it can never delay filing.
  await enrichSentryRows().catch(() => undefined);

  return {
    ok: discoverError === null,
    stats: { discovered, imported, recovered, failed },
    errors,
  };
}
