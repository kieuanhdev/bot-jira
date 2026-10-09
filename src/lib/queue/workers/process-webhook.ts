import { markEventFailed, markEventProcessed } from "@/lib/events/store";
import { prisma } from "@/lib/prisma";
import type { WorkerLog } from "../guard";
import { dispatchWebhook } from "./webhooks/dispatcher";
import { safeWebhookError } from "./webhooks/types";
import type { ProcessWebhookJobData } from "./webhooks/types";

export type { ProcessWebhookJobData } from "./webhooks/types";

/** Event lifecycle facade retained for queue registry and enqueue compatibility. */
export async function runProcessWebhook(
  data: ProcessWebhookJobData
): Promise<WorkerLog> {
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
    const result = await dispatchWebhook(source, payload);
    await markEventProcessed(eventId);
    return { ok: true, stats: { source, eventId, ...result } };
  } catch (error) {
    const message = safeWebhookError(error);
    await markEventFailed(eventId, message).catch(() => null);
    return { ok: false, errors: [message], stats: { source, eventId } };
  }
}
