"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
};

export function useUnreadCount() {
  const { data } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => api<{ unread: number }>("/api/notify/unread-count"),
    refetchInterval: 15000,
    retry: 0,
  });
  return data?.unread ?? 0;
}

export function useNotifications(limit = 50) {
  return useQuery({
    queryKey: ["notifications", limit],
    queryFn: () => api<{ items: Notification[] }>("/api/notify?limit=" + limit),
    refetchInterval: 15000,
    retry: 0,
  });
}

export function useMarkNotifications() {
  const qc = useQueryClient();
  return async (ids: string[]) => {
    await api("/api/notify/mark-read", { method: "POST", body: { ids } });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };
}
