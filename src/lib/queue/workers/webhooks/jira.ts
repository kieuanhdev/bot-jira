import { prisma } from "@/lib/prisma";
import { hasJiraCredentials, jira } from "@/lib/jira/client";
import { jiraIssueFieldsForProject } from "@/lib/jira/people-fields";
import { upsertJiraCommentsWithNew, upsertJiraIssue } from "@/lib/issues/cache";
import {
  notifyWatchersOfComment,
  notifyWatchersOfIssueChange,
} from "@/lib/issues/notify-watchers";
import { normalizeStatusToGroup } from "@/lib/reports/status";

type JiraChangelogItem = {
  field?: string;
  from?: string;
  to?: string;
  fromString?: string;
  toString?: string;
};

type JiraWebhookPayload = {
  event?: string;
  webhookEvent?: string;
  user?: { name?: string; displayName?: string; accountId?: string };
  issue?: { key?: string; fields?: { updated?: string } };
  comment?: { id?: string };
  changelog?: { id?: string; items?: JiraChangelogItem[] };
  webHookEvent?:
    | string
    | {
        key?: string;
        author?: { name?: string; displayName?: string };
        changelog?: { items?: JiraChangelogItem[] };
      };
};

/** Refresh a single Jira issue and its comments into the shared cache. */
async function refreshIssue(key: string, authorName?: string | null): Promise<string[]> {
  const previous = await prisma.issueCache.findUnique({ where: { jiraKey: key } });
  const issue = await jira.getIssue(
    key,
    await jiraIssueFieldsForProject(key.split("-")[0])
  );
  const { applied, data: current } = await upsertJiraIssue(issue);
  if (applied) {
    await notifyWatchersOfIssueChange(
      previous,
      { jiraKey: key, ...current },
      { authorName }
    ).catch(() => null);
  }
  const { newComments } = await upsertJiraCommentsWithNew(
    key,
    await jira.getComments(key)
  );
  for (const comment of newComments) {
    await notifyWatchersOfComment(
      key,
      comment.author,
      comment.body,
      comment.id
    );
  }
  return newComments.map((comment) => comment.id);
}

export async function handleJiraWebhook(
  payload: unknown
): Promise<Record<string, unknown>> {
  const webhook = payload as JiraWebhookPayload;
  const legacyEnvelope =
    typeof webhook.webHookEvent === "object" ? webhook.webHookEvent : undefined;
  const eventName =
    webhook.event ??
    webhook.webhookEvent ??
    (typeof webhook.webHookEvent === "string" ? webhook.webHookEvent : undefined) ??
    "";
  const key = legacyEnvelope?.key ?? webhook.issue?.key;
  const authorName =
    legacyEnvelope?.author?.name ??
    legacyEnvelope?.author?.displayName ??
    webhook.user?.name ??
    webhook.user?.displayName ??
    webhook.user?.accountId ??
    null;
  if (!key) return { skipped: true, reason: "no issue key" };
  if (!(await hasJiraCredentials())) {
    return { skipped: true, reason: "jira not configured" };
  }

  if (eventName === "jira:issue_commented" || Boolean(webhook.comment?.id)) {
    const previous = await prisma.issueCache.findUnique({ where: { jiraKey: key } });
    const issue = await jira.getIssue(
      key,
      await jiraIssueFieldsForProject(key.split("-")[0])
    );
    const { applied, data: current } = await upsertJiraIssue(issue);
    if (applied) {
      await notifyWatchersOfIssueChange(
        previous,
        { jiraKey: key, ...current },
        { authorName }
      ).catch(() => null);
    }
    const { newComments } = await upsertJiraCommentsWithNew(
      key,
      await jira.getComments(key)
    );
    for (const comment of newComments) {
      await notifyWatchersOfComment(
        comment.jiraKey,
        comment.author,
        comment.body,
        comment.id
      ).catch(() => null);
    }
    return { refreshed: key, newComments: newComments.length };
  }

  await refreshIssue(key, authorName);
  const items = legacyEnvelope?.changelog?.items ?? webhook.changelog?.items ?? [];
  const statusItem = items.find(
    (item) => (item.field ?? "").toLowerCase() === "status"
  );
  if (statusItem) {
    const fromStatus = statusItem.fromString ?? statusItem.from ?? null;
    const toStatus = statusItem.toString ?? statusItem.to ?? "";
    if (toStatus) {
      const projectKey = key.split("-")[0];
      const changelogId = webhook.changelog?.id ?? `${Date.now()}`;
      const eventKey = `${key}:status:${changelogId}:${fromStatus ?? "none"}->${toStatus}`;
      await prisma.issueTransitionEvent.upsert({
        where: { eventKey },
        create: {
          eventKey,
          jiraKey: key,
          projectKey,
          occurredAt: webhook.issue?.fields?.updated
            ? new Date(webhook.issue.fields.updated)
            : new Date(),
          fromStatus,
          toStatus,
          fromStatusGroup: fromStatus ? normalizeStatusToGroup(fromStatus) : null,
          toStatusGroup: normalizeStatusToGroup(toStatus),
          assigneeJira: authorName,
          source: "jira_webhook",
        },
        update: {},
      }).catch(() => null);
    }
  }

  const linkItems = items.filter((item) => {
    const field = (item.field ?? "").toLowerCase();
    return field === "link" || field === "issuelinks";
  });
  const otherRefreshed: string[] = [];
  for (const item of linkItems) {
    const text = `${item.fromString ?? ""} ${item.toString ?? ""} ${item.from ?? ""} ${item.to ?? ""}`;
    const matches = text.match(/[A-Z][A-Z0-9]+-\d+/g) ?? [];
    for (const otherKey of matches) {
      if (otherKey !== key && !otherRefreshed.includes(otherKey)) {
        otherRefreshed.push(otherKey);
        await refreshIssue(otherKey).catch(() => null);
      }
    }
  }

  return { refreshed: key, otherRefreshed };
}
