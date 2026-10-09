import { notifyUser, type NotifyInput } from "@/lib/notify";
import type { BranchNotificationMessage } from "./branch-notification-policy";

/**
 * Deliver a branch notification message to a set of user IDs.
 * Swallows individual delivery failures so one failing recipient doesn't block others.
 * Kept strictly outside policy rules.
 */
export async function deliverBranchNotifications(
  targetUserIds: Iterable<string>,
  message: BranchNotificationMessage,
  deliverFn: (userId: string, input: NotifyInput) => Promise<unknown> = notifyUser
): Promise<number> {
  let notifiedCount = 0;
  for (const userId of targetUserIds) {
    try {
      const res = await deliverFn(userId, message);
      if (res) notifiedCount++;
    } catch {
      // ignore per-user notification errors
    }
  }
  return notifiedCount;
}
