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
    // Cross-process notifications are persisted in PostgreSQL; a short poll
    // keeps the badge near-real-time without relying on in-memory events.
    refetchInterval: 3000,
    refetchOnWindowFocus: true,
    retry: 0,
  });
  return data?.unread ?? 0;
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

export function useDeleteNotifications() {
  const qc = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (body: { ids?: string[]; allRead?: boolean; all?: boolean }) =>
      api<{ ok: boolean; unreadCount: number }>("/api/notify", {
        method: "DELETE",
        body,
      }),
    onMutate: async (variables) => {
      await qc.cancelQueries({ queryKey: notificationsKeys.all });

      const prevUnread = qc.getQueryData<{ unread: number }>(notificationsKeys.unreadCount);

      qc.setQueriesData<NotificationResponse>(
        { queryKey: notificationsKeys.lists() },
        (old) => {
          if (!old) return old;
          const items = old.items.filter((item) => {
            if (variables.all) return false;
            if (variables.allRead && item.read) return false;
            if (variables.ids && variables.ids.includes(item.id)) return false;
            return true;
          });
          return { ...old, items };
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
      qc.invalidateQueries({ queryKey: notificationsKeys.infiniteAll() });
    },
  });

  return {
    deleteNotifications: (ids: string[]) => deleteMutation.mutateAsync({ ids }),
    deleteAllRead: () => deleteMutation.mutateAsync({ allRead: true }),
    deleteAll: () => deleteMutation.mutateAsync({ all: true }),
    isDeleting: deleteMutation.isPending,
  };
}
