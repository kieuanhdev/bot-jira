import { prisma } from "@/lib/prisma";
import { env, hasSentryConfig } from "../../guard";

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
  if (!hasSentryConfig()) {
    return { skipped: true, reason: "sentry not configured" };
  }
  const issue = webhook.issue;
  if (!issue) return { skipped: true, reason: "no issue in payload" };

  const issueId = String(issue.id ?? issue.shortId ?? "");
  const sentryProject = issue.project?.slug ?? env.sentryProject;
  if (webhook.action === "created" && issueId) {
    await prisma.sentryIssueImported.upsert({
      where: {
        sentryProject_sentryIssueId: { sentryProject, sentryIssueId: issueId },
      },
      create: { sentryProject, sentryIssueId: issueId, state: "pending" },
      update: {},
    });
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
      eventKey: `sentry:${sentryProject}:${issueId}:${webhook.action}`,
    });
    return { alerted: true, level: issue.level, seeded: true };
  }
  return { handled: webhook.action, issue: issue.shortId ?? issue.id };
}
