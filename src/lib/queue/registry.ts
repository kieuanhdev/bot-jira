import type { PgBoss } from "pg-boss";
import { env } from "@/lib/env";
import { captureProjectReportSnapshots } from "@/lib/reports/snapshot-service";
import type { WorkerLog } from "./guard";
import { scheduledJiraJobAgeMs, shouldSkipStaleJiraJob } from "./jira-job-policy";
import { buildQueueDefinitions } from "./job-names";
import { runAiScore } from "./workers/ai-score";
import { runBulkOperation } from "./workers/bulk-op";
import { runCheckBranches } from "./workers/check-branches";
import { runDeliverNotifications } from "./workers/deliver-notifications";
import { runDetectPeopleFields } from "./workers/detect-people-fields";
import { runHealthAlert } from "./workers/health-alert";
import { runParseCommentBranches } from "./workers/parse-comment-branches";
import type { PollJiraDispatchJobData } from "./enqueue";
import {
  runPollJiraProject,
  type JiraSyncSource,
  type PollJiraJobData,
  type PollJiraProjectJobData,
} from "./workers/poll-jira";
import { runPollPrComments } from "./workers/poll-pr-comments";
import { runPollWatchedIssues } from "./workers/poll-watched-issues";
import { runProcessWebhook, type ProcessWebhookJobData } from "./workers/process-webhook";
import {
  runRefreshBoardMembership,
  type RefreshBoardMembershipJobData,
} from "./workers/refresh-board-membership";
import { runSentryImport } from "./workers/sentry-import";
import { runStaleDetect } from "./workers/stale-detect";

type RecordRun = (name: string, run: () => Promise<WorkerLog>) => Promise<WorkerLog>;

type EnqueueJiraRecovery = (data: {
  projectKey: string;
  source: JiraSyncSource;
}) => Promise<string | null>;

export type WorkerRegistryDependencies = {
  recordRun: RecordRun;
  enqueueJiraProjectSync: EnqueueJiraRecovery;
  runPollJiraDispatch: (data: PollJiraDispatchJobData) => Promise<WorkerLog>;
};

let watchTimer: ReturnType<typeof setInterval> | undefined;

export async function registerQueues(boss: PgBoss): Promise<void> {
  const definitions = buildQueueDefinitions({
    jiraSyncExpireSeconds: env.jiraSyncExpireSeconds,
    jiraHeartbeatSeconds: env.jiraHeartbeatSeconds,
  });

  for (const definition of definitions) {
    await boss.createQueue(definition.name, definition.createOptions);
  }
  for (const definition of definitions) {
    await boss.updateQueue(definition.name, definition.updateOptions);
  }
}

export async function registerWorkers(
  boss: PgBoss,
  dependencies: WorkerRegistryDependencies
): Promise<void> {
  const { recordRun, enqueueJiraProjectSync, runPollJiraDispatch } = dependencies;

  await boss.work<PollJiraDispatchJobData>("poll-jira-dispatch", async (jobs) => {
    const job = jobs[0];
    return recordRun("poll-jira-dispatch", () => runPollJiraDispatch(job?.data ?? {}));
  });

  await boss.work<PollJiraProjectJobData>(
    "poll-jira-project",
    { localConcurrency: env.jiraPollConcurrency },
    async (jobs) => {
      const job = jobs[0];
      const data = job?.data;
      if (!data?.projectKey) {
        throw new Error("Missing projectKey in poll-jira-project job");
      }
      const projectKey = data.projectKey.trim().toUpperCase();

      if (shouldSkipStaleJiraJob(data, job)) {
        const ageMs = scheduledJiraJobAgeMs(data, job) ?? 0;
        console.warn(
          JSON.stringify({
            level: "warn",
            job: "poll-jira-project",
            project: projectKey,
            projectKey,
            ageMs,
            ageSeconds: Math.round(ageMs / 1000),
            source: data.source,
            requestedAt: data.requestedAt,
            reason: "Stale scheduled/startup job skipped",
            message: `Skipping stale scheduled poll-jira-project job for ${projectKey}`,
          })
        );
        return { ok: true, skipped: true, reason: "Stale job skipped" };
      }

      return recordRun(`poll-jira-project:${projectKey}`, () =>
        runPollJiraProject(data, { signal: job?.signal })
      );
    }
  );

  await boss.work<PollJiraJobData>("poll-jira", async (jobs) => {
    const job = jobs[0];
    const data = job?.data ?? {};
    if (data.projectKey) {
      return recordRun(`poll-jira-project:${data.projectKey.trim().toUpperCase()}`, () =>
        runPollJiraProject({
          projectKey: data.projectKey!,
          full: Boolean(data.full),
          source: data.source ?? (data.requestedBy ? "manual" : "schedule"),
          requestedBy: data.requestedBy,
          requestedAt: data.requestedAt ?? new Date().toISOString(),
        }, { signal: job?.signal })
      );
    }
    return recordRun("poll-jira-dispatch", () =>
      runPollJiraDispatch({
        full: Boolean(data.full),
        source: (data.source as "schedule" | "startup" | "admin" | undefined)
          ?? (data.requestedBy ? "admin" : "schedule"),
        requestedBy: data.requestedBy,
      })
    );
  });

  await boss.work("poll-watched-issues", { pollingIntervalSeconds: 2 },
    async () => recordRun("poll-watched-issues", runPollWatchedIssues));
  await boss.work("check-branches", async () => recordRun("check-branches", runCheckBranches));
  await boss.work("parse-comment-branches", async () => recordRun("parse-comment-branches", runParseCommentBranches));
  await boss.work("poll-pr-comments", async (jobs) => {
    const job = jobs[0];
    const rawJob = job as unknown as { createdOn?: Date | string; created_on?: Date | string };
    const createdTime = rawJob?.createdOn || rawJob?.created_on;
    if (createdTime) {
      const ageMs = Date.now() - new Date(createdTime).getTime();
      if (ageMs > 5 * 60_000) {
        console.warn(
          JSON.stringify({
            level: "warn",
            job: "poll-pr-comments",
            message: `Skipping stale scheduled poll-pr-comments job (queued ${Math.round(ageMs / 1000)}s ago)`,
          })
        );
        return { ok: true, skipped: true, reason: "Stale job skipped" };
      }
    }
    return recordRun("poll-pr-comments", runPollPrComments);
  });
  await boss.work("ai-score", async () => recordRun("ai-score", runAiScore));
  await boss.work("sentry-import", async () => recordRun("sentry-import", runSentryImport));
  await boss.work("stale-detect", async () => recordRun("stale-detect", runStaleDetect));
  await boss.work("health-alert", async () => recordRun("health-alert", () => runHealthAlert({
    enqueueJiraRecovery: (projectKey) => enqueueJiraProjectSync({
      projectKey,
      source: "recovery",
    }),
  })));
  await boss.work<RefreshBoardMembershipJobData>("refresh-board-membership", async (jobs) => {
    const job = jobs[0];
    if (!job?.data) return { ok: false, reason: "No job data" };
    const { userId, projectKey, boardId } = job.data;
    return recordRun(`refresh-board-membership:${userId}:${projectKey}:${boardId}`, () =>
      runRefreshBoardMembership(job.data)
    );
  });
  await boss.work("capture-project-report-snapshots", async () =>
    recordRun("capture-project-report-snapshots", async () => {
      const stats = await captureProjectReportSnapshots();
      return { ok: true, stats: { ...stats } };
    })
  );
  await boss.work("detect-people-fields", async () =>
    recordRun("detect-people-fields", runDetectPeopleFields)
  );
  await boss.work<ProcessWebhookJobData>("process-webhook", { pollingIntervalSeconds: 0.5 }, async (jobs) => {
    const data = jobs[0]?.data ?? { source: "jira", eventId: "" };
    const result = await runProcessWebhook(data);
    if (!result.ok) {
      throw new Error((result.errors ?? ["webhook processing failed"]).join("; "));
    }
    return { ok: true, stats: result.stats };
  });
  await boss.work("deliver-notifications", {
    pollingIntervalSeconds: 0.5,
    notifyPollingIntervalSeconds: 0.5,
    batchSize: 100,
    burstWhenBatchFull: true,
  }, async () => recordRun("deliver-notifications", runDeliverNotifications));
  await boss.work<{ operationId: string }>("bulk-op", async (jobs) => {
    const data = jobs[0]?.data ?? { operationId: "" };
    try {
      await runBulkOperation(data.operationId);
      return { ok: true, stats: { operationId: data.operationId } };
    } catch (error) {
      return { ok: false, errors: [(error as Error).message] };
    }
  });

  const pollWatches = () => boss.send("poll-watched-issues", {}, {
    singletonKey: "watched-issues",
    singletonSeconds: 25,
    expireInSeconds: 30,
    retryLimit: 0,
  }).catch((error) => console.error("Watch sync enqueue failed", String(error)));
  await pollWatches();
  stopRegistryTimers();
  watchTimer = setInterval(() => { void pollWatches(); }, 30_000);
  watchTimer.unref();
}

export function stopRegistryTimers(): void {
  if (watchTimer) clearInterval(watchTimer);
  watchTimer = undefined;
}
