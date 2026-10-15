"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { notificationsKeys, issuesKeys, branchesKeys } from "@/lib/query-keys";

export function NotificationEvents() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const userId = session?.user?.id;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId) return;
    const events = new EventSource("/api/notify/stream");
    events.onmessage = () => {
      // Debounce invalidation to batch rapid notification bursts
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: notificationsKeys.all });
        void queryClient.invalidateQueries({ queryKey: issuesKeys.all });
        void queryClient.invalidateQueries({ queryKey: branchesKeys.all });
        void queryClient.invalidateQueries({ queryKey: branchesKeys.tasksAll });
      }, 300);
    };

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.close();
    };
  }, [userId, queryClient]);

  return null;
}
