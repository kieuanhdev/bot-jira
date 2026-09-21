import { prisma } from "@/lib/prisma";
import { sentry, type SentryIssue } from "@/lib/sentry/client";
import { jira } from "@/lib/jira/client";
import { upsertJiraIssue } from "@/lib/issues/cache";
import { guard, hasSentryConfig, hasJiraConfig } from "../guard";
import { jiraProjectList, env } from "@/lib/env";
import type { WorkerLog } from "../guard";
import type { JiraIssue } from "@/lib/jira/types";

const IMPORT_BATCH = 10;
const MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 60_000;

function sentryProjectSlug(issue: SentryIssue): string {
  return issue.project?.slug ?? env.sentryProject;
}

function sentryIdKey(issue: SentryIssue): string {
  return String(issue.id);
}

function sentryLabel(issue: SentryIssue): string {
  return `sentry-id-${sentryIdKey(issue)}`;
}

function backoffMs(attemptCount: number): number {
  return BACKOFF_BASE_MS * 2 ** Math.min(attemptCount, 10);
}

async function findJiraIssueByLabel(label: string): Promise<JiraIssue | null> {
  const projectKeys = jiraProjectList;
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

async function processIssue(issue: SentryIssue): Promise<{ ok: boolean; recovered: boolean; error?: string }> {
  const sId = sentryIdKey(issue);
  const sProject = sentryProjectSlug(issue);
  const label = sentryLabel(issue);

  const existing = await prisma.sentryIssueImported.findUnique({
    where: { sentryProject_sentryIssueId: { sentryProject: sProject, sentryIssueId: sId } },
  });

  if (existing?.state === "created" && existing.jiraKey) {
    return { ok: true, recovered: false };
  }

  if (existing?.state === "failed") {
    const lastAttempt = existing.lastAttemptAt ? new Date(existing.lastAttemptAt) : new Date(0);
    if (Date.now() - lastAttempt.getTime() < backoffMs(existing.attemptCount)) {
      return { ok: true, recovered: false };
    }
  }

  let jiraKey: string | null = existing?.jiraKey ?? null;
  let recovered = false;

  if (!jiraKey) {
    const found = await findJiraIssueByLabel(label);
    if (found) {
      jiraKey = found.key;
      recovered = true;
    }
  }

  if (!jiraKey) {
    const title = `[Sentry] ${issue.shortId ?? sId}: ${issue.title}`;
    const description = [
      "Auto-created from Sentry.",
      "",
      `Sentry issue: ${issue.permalinkUrl ?? issue.shortId ?? sId}`,
      `Level: ${issue.level ?? "unknown"}`,
      `Count: ${issue.count ?? "n/a"}`,
      `Last seen: ${issue.latestEvent ?? "n/a"}`,
    ].join("\n");

    const created = await jira.createIssue({
      projectKey: jiraProjectList[0] ?? "PROJ",
      summary: title,
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

  await prisma.sentryIssueImported.upsert({
    where: { sentryProject_sentryIssueId: { sentryProject: sProject, sentryIssueId: sId } },
    create: {
      sentryProject: sProject,
      sentryIssueId: sId,
      jiraKey,
      state: "created",
      attemptCount: (existing?.attemptCount ?? 0) + 1,
      lastAttemptAt: new Date(),
      importedAt: new Date(),
    },
    update: {
      jiraKey,
      state: "created",
      attemptCount: (existing?.attemptCount ?? 0) + 1,
      lastError: null,
      lastAttemptAt: new Date(),
      importedAt: new Date(),
    },
  });

  return { ok: true, recovered };
}

export async function runSentryImport(): Promise<WorkerLog> {
  if (!hasSentryConfig()) return guard(hasSentryConfig(), "Sentry not configured");
  if (!hasJiraConfig()) return guard(hasJiraConfig(), "Jira not configured");

  let imported = 0;
  let recovered = 0;
  let failed = 0;
  const errors: string[] = [];

  try {
    const issues = await sentry.listUnresolvedIssues(IMPORT_BATCH);
    for (const issue of issues) {
      const sId = sentryIdKey(issue);
      const sProject = sentryProjectSlug(issue);

      const existing = await prisma.sentryIssueImported.findUnique({
        where: { sentryProject_sentryIssueId: { sentryProject: sProject, sentryIssueId: sId } },
      });

      if (existing?.state === "created") continue;

      try {
        const result = await processIssue(issue);
        if (result.recovered) recovered++;
        imported++;
      } catch (e) {
        const message = (e as Error).message.slice(0, 500);
        const attempts = (existing?.attemptCount ?? 0) + 1;
        const shouldFail = attempts >= MAX_ATTEMPTS;

        await prisma.sentryIssueImported.upsert({
          where: { sentryProject_sentryIssueId: { sentryProject: sProject, sentryIssueId: sId } },
          create: {
            sentryProject: sProject,
            sentryIssueId: sId,
            state: shouldFail ? "failed" : "pending",
            attemptCount: attempts,
            lastError: message,
            lastAttemptAt: new Date(),
          },
          update: {
            state: shouldFail ? "failed" : "pending",
            attemptCount: attempts,
            lastError: message,
            lastAttemptAt: new Date(),
          },
        });

        if (shouldFail) {
          failed++;
        }
        errors.push(`${issue.shortId ?? sId}: ${message}`);
      }
    }
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }

  return {
    ok: true,
    stats: { imported, recovered, failed } as unknown as Record<string, number>,
    errors,
  };
}
