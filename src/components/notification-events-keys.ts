import type { QueryKey } from "@tanstack/react-query";
import { notificationsKeys } from "@/lib/query-keys";

/**
 * Query keys to invalidate for any SSE message from `/api/notify/stream`.
 *
 * The stream only sends `ready` (on every (re)connect) and `changed` (a
 * notification was persisted), neither of which says issues or branches changed.
 * Invalidating them here refetched up to 1,000 board rows on every reconnect, so
 * those queries are left to their own polling and the sync-completion handler.
 */
export function notificationEventQueryKeys(): QueryKey[] {
  return [notificationsKeys.all];
}
