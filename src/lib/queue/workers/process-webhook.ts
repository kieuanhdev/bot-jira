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
 * PR comment events notify the author and reviewers.
 */
async function handleBitbucket(json: unknown): Promise<Record<string, unknown>> {
  const j = json as {
    eventKey?: string;
    data?: {
      repository?: { slug?: string; project?: { key?: string } };
      pullRequest?: {
        id?: number;
        title?: string;
        state?: string;
        fromRef?: { branch?: string };
        toRef?: { branch?: string; repository?: { slug?: string; project?: { key?: string } } };
        author?: { user?: { name?: string; displayName?: string; emailAddress?: string } };
        reviewers?: Array<{ user?: { name?: string; displayName?: string; emailAddress?: string } }>;
      };
      comment?: {
        id?: number;
        text?: string;
        author?: { name?: string; displayName?: string; emailAddress?: string };
      };
      branches?: Array<{ name?: string; latestCommit?: string }>;
    };
    repository?: { slug?: string; project?: { key?: string } };
    pullRequest?: {
      id?: number;
      title?: string;
      state?: string;
      fromRef?: { branch?: string };
      toRef?: { branch?: string; repository?: { slug?: string; project?: { key?: string } } };
      author?: { user?: { name?: string; displayName?: string; emailAddress?: string } };
      reviewers?: Array<{ user?: { name?: string; displayName?: string; emailAddress?: string } }>;
    };
    comment?: {
      id?: number;
      text?: string;
      author?: { name?: string; displayName?: string; emailAddress?: string };
    };
  };

  const repoObj =
    j.data?.repository ??
    j.pullRequest?.toRef?.repository ??
    j.repository;
  const repo = repoObj
    ? `${repoObj.project?.key ?? ""}/${repoObj.slug ?? ""}`
    : undefined;
  if (!repo) return { skipped: true, reason: "no repository" };
  if (!hasBitbucketConfig()) return { skipped: true, reason: "bitbucket not configured" };

  const pr = j.pullRequest ?? j.data?.pullRequest;
  const comment = j.comment ?? j.data?.comment;

  // Handle PR comment events (e.g. pr:comment:added)
  if (j.eventKey?.startsWith("pr:comment:") || (comment?.id && comment?.text && pr?.id)) {
    if (comment?.id && comment.text && pr?.id) {
      const { bitbucket } = await import("@/lib/bitbucket/client");
      const { notifyPrComment } = await import("@/lib/bitbucket/notify-pr-comment");

      // Load full PR if author or reviewers are missing from payload
      let fullPr = pr;
      if (!pr.author?.user || !pr.reviewers) {
        const fetched = await bitbucket.getPullRequest(repo, pr.id).catch(() => null);
        if (fetched) {
          fullPr = fetched as typeof pr;
        }
      }

      const res = await notifyPrComment({
        repo,
        pr: {
          id: pr.id,
          title: fullPr.title ?? pr.title,
          author: fullPr.author as any,
          reviewers: fullPr.reviewers as any,
        },
        comment: {
          id: comment.id,
          text: comment.text,
          author: comment.author as any,
        },
      });

      return {
        repo,
        prId: pr.id,
        commentId: comment.id,
        notifiedCount: res.notifiedCount,
      };
    }
    return { skipped: true, reason: "incomplete comment payload" };
  }

  const updates: Record<string, unknown> = { repo };
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
      project?: { slug?: string };
    };
  };
  if (!hasSentryConfig()) return { skipped: true, reason: "sentry not configured" };
  const issue = j.issue;
  if (!issue) return { skipped: true, reason: "no issue in payload" };

  const issueId = String(issue.id ?? issue.shortId ?? "");
  const sProject = issue.project?.slug ?? env.sentryProject;

  // M2 — on "created", seed a pending import row so the scheduled
  // `sentry-import` worker creates the Jira issue promptly (webhook + poll
  // reconciliation; idempotent on (sentryProject, sentryIssueId)).
  if (j.action === "created" && issueId) {
    await prisma.sentryIssueImported.upsert({
      where: { sentryProject_sentryIssueId: { sentryProject: sProject, sentryIssueId: issueId } },
      create: { sentryProject: sProject, sentryIssueId: issueId, state: "pending" },
      update: {},
    });
  }

  const blocking = env.sentryBlockingLevels.includes((issue.level ?? "").toLowerCase());
  if (j.action === "created" && blocking) {
    const { notifyAll } = await import("@/lib/notify");
    await notifyAll({
      type: "sentry",
      title: `Lỗi Sentry chặn phát hành: ${issue.title ?? issue.shortId ?? String(issue.id)}`,
      body: issue.permalinkUrl ?? undefined,
      link: issue.permalinkUrl ?? undefined,
      severity: "danger",
      eventKey: `sentry:${sProject}:${issueId}:${j.action}`,
    });
    return { alerted: true, level: issue.level, seeded: true };
  }
  return { handled: j.action, issue: issue.shortId ?? issue.id };
}

/**
 * CI webhook handler. Upserts the CiBuildStatus read model so the `ci` release
 * gate can read the latest build for the release's commit. The event row itself
 * remains the correlation trail for E2E checks.
 */
async function handleCi(json: unknown): Promise<Record<string, unknown>> {
  const j = json as {
    runId?: string | number;
    run_id?: string | number;
    status?: string;
    testStatus?: string;
    branch?: string;
    commit?: string;
    repo?: string;
    url?: string;
    provider?: string;
    startedAt?: string;
    completedAt?: string;
  };
  const repo = j.repo ?? "default";
  const branch = j.branch ?? "";
  const commit = j.commit ?? "";
  const runId = String(j.runId ?? j.run_id ?? "");
  if (!runId || !commit) return { skipped: true, reason: "no runId or commit" };

  const externalId = `${j.status ?? "event"}:${repo}:${commit}:${runId}`;
  const status = normalizeCiStatus(j.status);
  await prisma.ciBuildStatus.upsert({
    where: { provider_externalId: { provider: j.provider ?? "ci", externalId } },
    create: {
      provider: j.provider ?? "ci",
      externalId,
      repo,
      branch,
      commitSha: commit,
      status,
      testStatus: j.testStatus ?? null,
      url: j.url ?? null,
      startedAt: j.startedAt ? new Date(j.startedAt) : null,
      completedAt: j.completedAt ? new Date(j.completedAt) : null,
    },
    update: {
      status,
      testStatus: j.testStatus ?? null,
      url: j.url ?? null,
      completedAt: j.completedAt ? new Date(j.completedAt) : new Date(),
    },
  });
  return { upserted: externalId, status };
}

/** Normalize provider-specific CI status strings into the read-model set. */
function normalizeCiStatus(status?: string): "pending" | "success" | "failed" | "cancelled" {
  const s = (status ?? "").toLowerCase();
  if (/success|passed|pass|succeeded|ok/.test(s)) return "success";
  if (/fail|error|failed/.test(s)) return "failed";
  if (/cancel|aborted|stopped/.test(s)) return "cancelled";
  return "pending";
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
