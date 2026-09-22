import { prisma } from "@/lib/prisma";
import { jira } from "@/lib/jira/client";
import { upsertJiraIssue, upsertJiraCommentsWithNew } from "@/lib/issues/cache";
import { notifyWatchersOfComment } from "@/lib/issues/notify-watchers";
import { markEventProcessed, type Source } from "@/lib/events/store";
import { env, hasJiraConfig, hasBitbucketConfig, hasSentryConfig } from "../guard";
import type { WorkerLog } from "../guard";

export type ProcessWebhookJobData = {
  source: Source;
  eventId: string;
};

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}

/** Refresh a single Jira issue + comments into the cache (idempotent). */
async function refreshIssue(key: string): Promise<string[]> {
  const issue = await jira.getIssue(key);
  await upsertJiraIssue(issue);
  const { newComments } = await upsertJiraCommentsWithNew(key, await jira.getComments(key));
  return newComments.map((c) => c.id);
}

/**
 * Jira webhook handler. `jira:issue_updated` / `jira:issue_created` refresh
 * the issue cache; `jira:issue_commented` refreshes comments and notifies
 * watchers. All work is idempotent — the poll worker converges to the same
 * state if this handler is missed (webhook + poll reconciliation, M5 DoD).
 */
async function handleJira(json: unknown): Promise<Record<string, unknown>> {
  const j = json as {
    event?: string;
    webHookEvent?: { key?: string };
  };
  const key = j.webHookEvent?.key;
  if (!key) return { skipped: true, reason: "no issue key" };
  if (!hasJiraConfig()) return { skipped: true, reason: "jira not configured" };

  if (j.event === "jira:issue_commented") {
    await upsertJiraIssue(await jira.getIssue(key));
    const { newComments } = await upsertJiraCommentsWithNew(key, await jira.getComments(key));
    for (const nc of newComments) {
      // The comment id is the dedupe key, so the poll worker and this handler
      // can both see the comment without double-notifying watchers.
      await notifyWatchersOfComment(nc.jiraKey, nc.author, nc.body, nc.id).catch(() => null);
    }
    return { refreshed: key, newComments: newComments.length };
  }
  await refreshIssue(key);
  return { refreshed: key };
}

/**
 * Bitbucket webhook handler. PR and branch events update BranchInfo so the
 * release gates see the latest state without waiting for the 5-minute cron.
 */
async function handleBitbucket(json: unknown): Promise<Record<string, unknown>> {
  const j = json as {
    data?: {
      repository?: { slug?: string; project?: { key?: string } };
      pullRequest?: {
        id?: number;
        state?: string;
        fromRef?: { branch?: string };
        toRef?: { branch?: string };
      };
      branches?: Array<{ name?: string; latestCommit?: string }>;
    };
  };
  const repo = j.data?.repository
    ? `${j.data.repository.project?.key ?? ""}/${j.data.repository.slug ?? ""}`
    : undefined;
  if (!repo) return { skipped: true, reason: "no repository" };
  if (!hasBitbucketConfig()) return { skipped: true, reason: "bitbucket not configured" };

  const updates: Record<string, unknown> = { repo };
  const pr = j.data?.pullRequest;
  if (pr?.fromRef?.branch) {
    await prisma.branchInfo.upsert({
      where: { repo_branch: { repo, branch: pr.fromRef.branch } },
      create: {
        repo,
        branch: pr.fromRef.branch,
        prId: pr.id ?? null,
        prState: pr.state ?? null,
        prDestinationBranch: pr.toRef?.branch ?? null,
        merged: pr.state === "MERGED",
        checkedAt: new Date(),
      },
      update: {
        prId: pr.id ?? null,
        prState: pr.state ?? null,
        prDestinationBranch: pr.toRef?.branch ?? null,
        merged: pr.state === "MERGED",
        checkedAt: new Date(),
      },
    });
    updates.branch = pr.fromRef.branch;
    updates.prState = pr.state;
  }
  if (j.data?.branches) {
    for (const b of j.data.branches) {
      if (!b.name) continue;
      await prisma.branchInfo.upsert({
        where: { repo_branch: { repo, branch: b.name } },
        create: { repo, branch: b.name, lastCommitAt: b.latestCommit ? new Date(b.latestCommit) : null, checkedAt: new Date() },
        update: { lastCommitAt: b.latestCommit ? new Date(b.latestCommit) : undefined, checkedAt: new Date() },
      });
    }
  }
  return updates;
}

/**
 * Sentry webhook handler. A newly created blocking-level issue alerts everyone
 * (release-blocking levels per SENTRY_BLOCKING_LEVELS).
 */
async function handleSentry(json: unknown): Promise<Record<string, unknown>> {
  const j = json as {
    action?: string;
    issue?: {
      id?: number;
      shortId?: string;
      title?: string;
      permalinkUrl?: string;
      level?: string;
    };
  };
  if (!hasSentryConfig()) return { skipped: true, reason: "sentry not configured" };
  const issue = j.issue;
  if (!issue) return { skipped: true, reason: "no issue in payload" };

  const blocking = env.sentryBlockingLevels.includes((issue.level ?? "").toLowerCase());
  if (j.action === "created" && blocking) {
    const { notifyAll } = await import("@/lib/notify");
    await notifyAll({
      type: "sentry",
      title: `Sentry ${issue.level ?? "error"}: ${issue.title ?? issue.shortId ?? String(issue.id)}`,
      body: issue.permalinkUrl ?? undefined,
      link: issue.permalinkUrl ?? undefined,
    });
    return { alerted: true, level: issue.level };
  }
  return { handled: j.action, issue: issue.shortId ?? issue.id };
}

/**
 * CI webhook handler. Currently stores nothing beyond the event row (the CI
 * gate in the release engine reads CI state through the configured gate). The
 * event row itself gives us a correlation trail for later E2E checks.
 */
async function handleCi(json: unknown): Promise<Record<string, unknown>> {
  const j = json as { status?: string; branch?: string; repo?: string };
  return { status: j.status ?? "unknown", branch: j.branch ?? null, repo: j.repo ?? null };
}

const HANDLERS: Record<Source, (json: unknown) => Promise<Record<string, unknown>>> = {
  jira: handleJira,
  bitbucket: handleBitbucket,
  sentry: handleSentry,
  ci: handleCi,
};

export async function runProcessWebhook(data: ProcessWebhookJobData): Promise<WorkerLog> {
  const { source, eventId } = data;
  const event = await prisma.integrationEvent.findUnique({ where: { id: eventId } });
  if (!event) return { ok: false, errors: [`event ${eventId} not found`] };
  if (event.processedAt) {
    return { ok: true, skipped: true, reason: "already processed", stats: { eventId } };
  }

  let payload: unknown;
  try {
    payload = event.payload;
  } catch {
    payload = {};
  }

  try {
    const result = await HANDLERS[source](payload);
    await markEventProcessed(eventId);
    return { ok: true, stats: { source, eventId, ...result } };
  } catch (error) {
    const message = safeError(error);
    await markEventProcessed(eventId, message).catch(() => null);
    return { ok: false, errors: [message], stats: { source, eventId } };
  }
}
