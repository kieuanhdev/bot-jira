import type { Source } from "@/lib/events/store";

export type ProcessWebhookJobData = {
  source: Source;
  eventId: string;
};

export type WebhookHandler = (
  payload: unknown
) => Promise<Record<string, unknown>>;

export function safeWebhookError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}
