import { env } from "@/lib/env";
import { startBoss } from "./connection";
import type {
  JiraSyncSource,
  PollJiraJobData,
} from "./workers/poll-jira";
import type { ProcessWebhookJobData } from "./workers/process-webhook";
import type { RefreshBoardMembershipJobData } from "./workers/refresh-board-membership";

export type JiraProjectSyncRequest = {
  projectKey: string;
  full?: boolean;
  source?: JiraSyncSource;
  requestedBy?: string;
  requestedAt?: string;
};

export type PollJiraDispatchJobData = {
  full?: boolean;
  source?: "schedule" | "startup" | "admin";
  requestedBy?: string;
  projectKeys?: string[];
};

export async function enqueueJiraProjectSync(
  data: JiraProjectSyncRequest
): Promise<string | null> {
  const boss = await startBoss();
  const normalizedKey = data.projectKey.trim().toUpperCase();
  const source = data.source ?? (data.requestedBy ? "manual" : "schedule");
  const priority = source === "manual" || source === "admin"
    ? 10
    : source === "recovery"
      ? 5
      : source === "startup"
        ? 2
        : 1;
  const requestedAt = data.requestedAt ?? new Date().toISOString();

  return boss.send(
    "poll-jira-project",
    {
      projectKey: normalizedKey,
      full: Boolean(data.full),
      source,
      requestedBy: data.requestedBy,
      requestedAt,
    },
    {
      singletonKey: normalizedKey,
      singletonSeconds: source === "recovery" ? 240 : 55,
      priority,
      retryLimit: 4,
      retryDelay: 10,
      retryBackoff: true,
      expireInSeconds: data.full
        ? Math.max(env.jiraSyncExpireSeconds, 900)
        : env.jiraSyncExpireSeconds,
      heartbeatSeconds: env.jiraHeartbeatSeconds,
    }
  );
}

export async function enqueueJiraDispatch(
  data: PollJiraDispatchJobData = {}
): Promise<string | null> {
  const boss = await startBoss();
  const source = data.source ?? "schedule";
  const priority = source === "admin" ? 5 : source === "startup" ? 2 : 1;
  return boss.send("poll-jira-dispatch", data, {
    singletonKey: "jira-dispatch",
    singletonSeconds: 50,
    priority,
    retryLimit: 2,
    retryDelay: 5,
    expireInSeconds: 60,
  });
}

export async function enqueueJiraSync(data: PollJiraJobData): Promise<string | null> {
  if (data.projectKey) {
    return enqueueJiraProjectSync({
      projectKey: data.projectKey,
      full: data.full,
      source: data.source ?? (data.requestedBy ? "manual" : "schedule"),
      requestedBy: data.requestedBy,
      requestedAt: data.requestedAt,
    });
  }
  return enqueueJiraDispatch({
    full: data.full,
    source: (data.source as "schedule" | "startup" | "admin" | undefined)
      ?? (data.requestedBy ? "admin" : "schedule"),
    requestedBy: data.requestedBy,
  });
}

export async function enqueueWebhookEvent(
  data: ProcessWebhookJobData
): Promise<string | null> {
  const boss = await startBoss();
  return boss.send("process-webhook", data, {
    singletonKey: `process-webhook:${data.eventId}`,
    singletonSeconds: 60,
    retryLimit: 2,
    retryDelay: 30,
    retryBackoff: true,
  });
}

export async function enqueueBulkOperation(operationId: string): Promise<string | null> {
  const boss = await startBoss();
  return boss.send("bulk-op", { operationId }, {
    singletonKey: `bulk-op:${operationId}`,
    singletonSeconds: 3600,
    retryLimit: 1,
    retryDelay: 60,
  });
}

export async function enqueueCheckBranches(): Promise<string | null> {
  const boss = await startBoss();
  return boss.send("check-branches", {}, {
    singletonKey: "check-branches:manual",
    singletonSeconds: 30,
    retryLimit: 1,
    retryDelay: 15,
  });
}

export async function enqueuePollPrComments(): Promise<string | null> {
  const boss = await startBoss();
  return boss.send("poll-pr-comments", {}, {
    singletonKey: "poll-pr-comments:manual",
    singletonSeconds: 30,
    retryLimit: 1,
    retryDelay: 15,
  });
}

export async function enqueueNotificationDelivery(
  startAfter?: Date
): Promise<string | null> {
  const boss = await startBoss();
  return boss.send("deliver-notifications", {}, {
    ...(startAfter ? { startAfter } : {}),
    retryLimit: 3,
    retryDelay: 15,
    retryBackoff: true,
  });
}

export async function enqueueBoardMembershipRefresh(
  data: RefreshBoardMembershipJobData
): Promise<string | null> {
  // Producer-off: single project board mode does not use membership jobs.
  void data;
  return null;
}
