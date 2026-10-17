import { env, hasSentryConfig, hasSentryWebhookConfig } from "../../guard";
import {
  sentryIdKey,
  sentryProjectSlug,
  buildSentryEventKey,
} from "@/lib/sentry/idempotency";
import { seedSentryIssue } from "@/lib/sentry/review-queue";

type SentryWebhookPayload = {
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

export async function handleSentryWebhook(
  payload: unknown
): Promise<Record<string, unknown>> {
  const webhook = payload as SentryWebhookPayload;
  if (!hasSentryConfig() && !hasSentryWebhookConfig()) {
    return { skipped: true, reason: "sentry not configured" };
  }
  const issue = webhook.issue;
  if (!issue) return { skipped: true, reason: "no issue in payload" };

  const issueId = sentryIdKey(issue);
  const sentryProject = sentryProjectSlug(issue, env.sentryProject);
  if (webhook.action === "created" && issueId) {
    await seedSentryIssue(issue);
  }

  const blocking = env.sentryBlockingLevels.includes(
    (issue.level ?? "").toLowerCase()
  );
  if (webhook.action === "created" && blocking) {
    const { notifyAll } = await import("@/lib/notify");
    await notifyAll({
      type: "sentry",
      title: `Lỗi Sentry chặn phát hành: ${issue.title ?? issue.shortId ?? String(issue.id)}`,
      body: issue.permalinkUrl ?? undefined,
      link: issue.permalinkUrl ?? undefined,
      severity: "danger",
      eventKey: buildSentryEventKey(sentryProject, issueId, webhook.action),
    });
    return { alerted: true, level: issue.level, seeded: true };
  }
  return { handled: webhook.action, issue: issue.shortId ?? issue.id };
}
