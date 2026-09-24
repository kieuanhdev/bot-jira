"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { notificationsKeys } from "@/lib/query-keys";

export type Notification = {
  id: string;
  type: string;
  severity?: "info" | "warning" | "danger" | "success";
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
  eventKey?: string;
};

export type NotificationResponse = {
  items: Notification[];
  unreadCount: number;
  nextCursor: string | null;
};

export function useUnreadCount() {
  const { data } = useQuery({
    queryKey: notificationsKeys.unreadCount,
    queryFn: () => api<{ unread: number }>("/api/notify/unread-count"),
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    retry: 0,
  });
  return data?.unread ?? 0;
}

export function useNotifications(options: {
  limit?: number;
  enabled?: boolean;
  unreadOnly?: boolean;
  type?: string;
  cursor?: string;
} = {}) {
  const { limit = 20, enabled = true, unreadOnly, type, cursor } = options;

  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (unreadOnly) params.set("unreadOnly", "1");
  if (type) params.set("type", type);
  if (cursor) params.set("cursor", cursor);

  return useQuery({
    queryKey: notificationsKeys.list({ limit, unreadOnly, type, cursor }),
    queryFn: () => api<NotificationResponse>(`/api/notify?${params.toString()}`),
    enabled,
    retry: 1,
  });
}

export function useMarkNotifications() {
  const qc = useQueryClient();

  const markMutation = useMutation({
    mutationFn: (body: { ids?: string[]; all?: boolean; unread?: boolean; before?: string }) =>
      api<{ ok: boolean; unreadCount: number }>("/api/notify/mark-read", {
        method: "POST",
        body,
      }),
    onMutate: async (variables) => {
      await qc.cancelQueries({ queryKey: notificationsKeys.all });

      const prevUnread = qc.getQueryData<{ unread: number }>(notificationsKeys.unreadCount);

      // Optimistically update notifications list queries
      qc.setQueriesData<NotificationResponse>(
        { queryKey: notificationsKeys.lists() },
        (old) => {
          if (!old) return old;
          const markRead = !variables.unread;
          const nowIso = new Date().toISOString();

          const items = old.items.map((item) => {
            if (variables.all || (variables.ids && variables.ids.includes(item.id))) {
              return {
                ...item,
                read: markRead,
                readAt: markRead ? nowIso : null,
              };
            }
            return item;
          });

          return {
            ...old,
            items,
          };
        }
      );

      return { prevUnread };
    },
    onSuccess: (data) => {
      if (typeof data?.unreadCount === "number") {
        qc.setQueryData(notificationsKeys.unreadCount, { unread: data.unreadCount });
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: notificationsKeys.all });
    },
  });

  return {
    markRead: (ids: string[]) => markMutation.mutateAsync({ ids, unread: false }),
    markUnread: (ids: string[]) => markMutation.mutateAsync({ ids, unread: true }),
    markAllRead: (before?: string) => markMutation.mutateAsync({ all: true, before }),
    isPending: markMutation.isPending,
  };
}
