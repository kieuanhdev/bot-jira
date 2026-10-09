import type { Source } from "@/lib/events/store";
import { handleBitbucketWebhook } from "./bitbucket";
import { handleCiWebhook } from "./ci";
import { handleJiraWebhook } from "./jira";
import { handleSentryWebhook } from "./sentry";
import type { WebhookHandler } from "./types";

const WEBHOOK_HANDLERS: Record<Source, WebhookHandler> = {
  jira: handleJiraWebhook,
  bitbucket: handleBitbucketWebhook,
  sentry: handleSentryWebhook,
  ci: handleCiWebhook,
};

export function dispatchWebhook(
  source: Source,
  payload: unknown
): Promise<Record<string, unknown>> {
  return WEBHOOK_HANDLERS[source](payload);
}
