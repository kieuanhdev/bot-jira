import type { Queue, UpdateQueueOptions } from "pg-boss";

export const JOB_NAMES = [
  "poll-jira-dispatch",
  "poll-jira-project",
  "poll-jira",
  "poll-watched-issues",
  "refresh-board-membership",
  "check-branches",
  "parse-comment-branches",
  "poll-pr-comments",
  "ai-score",
  "sentry-import",
  "stale-detect",
  "bulk-op",
  "process-webhook",
  "deliver-notifications",
  "health-alert",
  "capture-project-report-snapshots",
  "detect-people-fields",
] as const;

export type JobName = (typeof JOB_NAMES)[number];

export type QueueDefinition = {
  name: JobName;
  createOptions?: Omit<Queue, "name">;
  updateOptions: UpdateQueueOptions;
};

const QUEUE_EXPIRE_SECONDS: Record<JobName, number | "jira-sync"> = {
  "poll-jira-dispatch": 60,
  "poll-jira-project": "jira-sync",
  "poll-jira": 300,
  "poll-watched-issues": 30,
  "refresh-board-membership": 180,
  "check-branches": 300,
  "parse-comment-branches": 120,
  "poll-pr-comments": 180,
  "ai-score": 300,
  "sentry-import": 120,
  "stale-detect": 300,
  "bulk-op": 3600,
  "process-webhook": 120,
  "deliver-notifications": 60,
  "health-alert": 60,
  "capture-project-report-snapshots": 300,
  "detect-people-fields": 300,
};

const QUEUE_POLICIES: Partial<Record<JobName, Queue["policy"]>> = {
  "poll-jira-dispatch": "singleton",
  "poll-jira-project": "stately",
  "poll-jira": "singleton",
  "poll-watched-issues": "singleton",
};

export function buildQueueDefinitions(options: {
  jiraSyncExpireSeconds: number;
  jiraHeartbeatSeconds: number;
}): QueueDefinition[] {
  return JOB_NAMES.map((name) => {
    const policy = QUEUE_POLICIES[name];
    const configuredExpire = QUEUE_EXPIRE_SECONDS[name];
    const expireInSeconds = configuredExpire === "jira-sync"
      ? options.jiraSyncExpireSeconds
      : configuredExpire;

    return {
      name,
      ...(policy ? { createOptions: { policy } } : {}),
      updateOptions: {
        notify: true,
        expireInSeconds,
        ...(name === "poll-jira-project" && options.jiraHeartbeatSeconds
          ? { heartbeatSeconds: options.jiraHeartbeatSeconds }
          : {}),
      },
    };
  });
}
