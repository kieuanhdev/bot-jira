"use client";

import { useQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { notificationsKeys } from "@/lib/query-keys";

export type Notification = {
  id: string;
  type: string;
  severity?: "info" | "warning" | "danger" | "success";
  title: string;
  body: string;
  link: string | null;
  sourceLink?: string | null;
  sourceType?: "jira" | "git" | null;
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
    // Cross-process notifications are persisted in PostgreSQL; SSE provides real-time updates.
    // A 60-second fallback poll keeps the badge consistent even if SSE reconnects or drops.
    refetchInterval: 60_000,
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
        keepalive: true,
      }),
    onMutate: async (variables) => {
      await qc.cancelQueries({ queryKey: notificationsKeys.all });

      const prevUnread = qc.getQueryData<{ unread: number }>(notificationsKeys.unreadCount);
      const markRead = !variables.unread;
      const nowIso = new Date().toISOString();

      // Optimistically update notifications infinite queries
      qc.setQueriesData<InfiniteData<NotificationResponse>>(
        { queryKey: notificationsKeys.infiniteAll() },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((item) => {
                if (variables.all || (variables.ids && variables.ids.includes(item.id))) {
                  return {
                    ...item,
                    read: markRead,
                    readAt: markRead ? nowIso : null,
                  };
                }
                return item;
              }),
            })),
          };
        }
      );

      // Optimistically update notifications list queries
      qc.setQueriesData<NotificationResponse>(
        { queryKey: notificationsKeys.lists() },
        (old) => {
          if (!old) return old;
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

      // Optimistically update unreadCount
      if (variables.all) {
        qc.setQueryData(notificationsKeys.unreadCount, { unread: 0 });
      } else if (variables.ids && variables.ids.length > 0) {
        const current = prevUnread?.unread ?? 0;
        const delta = variables.ids.length;
        const nextUnread = variables.unread ? current + delta : Math.max(0, current - delta);
        qc.setQueryData(notificationsKeys.unreadCount, { unread: nextUnread });
      }

      return { prevUnread };
    },
    onError: (_err, _variables, context) => {
      if (context?.prevUnread) {
        qc.setQueryData(notificationsKeys.unreadCount, context.prevUnread);
      }
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

      // Optimistically update notifications infinite queries
      qc.setQueriesData<InfiniteData<NotificationResponse>>(
        { queryKey: notificationsKeys.infiniteAll() },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.filter((item) => {
                if (variables.all) return false;
                if (variables.allRead && item.read) return false;
                if (variables.ids && variables.ids.includes(item.id)) return false;
                return true;
              }),
            })),
          };
        }
      );

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
